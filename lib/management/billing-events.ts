import "server-only";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { stripe } from "./stripe";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices, rentSchedules } from "@/lib/db/schema";
function invoiceUuid(id: string) {
  const h = createHash("sha256").update(`stripe-invoice:${id}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const billingEvents = [
  "payment_intent.processing",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.failed",
  "charge.dispute.created",
  "charge.dispute.closed",
  "charge.refunded",
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.voided",
  "invoice.marked_uncollectible",
  "subscription_schedule.created",
  "subscription_schedule.updated",
  "subscription_schedule.canceled",
  "subscription_schedule.completed",
  "subscription_schedule.released",
];
export async function handleBillingEvent(event: Stripe.Event) {
  const d = db();
  if (event.type.startsWith("subscription_schedule.")) {
    const payload = event.data.object as Stripe.SubscriptionSchedule;
    if (!payload.metadata?.rentScheduleId) return;
    const schedule = await stripe().subscriptionSchedules.retrieve(payload.id),
      id = schedule.metadata?.rentScheduleId;
    if (!id) return;
    await d
      .update(rentSchedules)
      .set({
        status: sql`case when ${rentSchedules.status} in ('canceled','canceling','completed','released') then ${rentSchedules.status} else ${schedule.status} end`,
        stripeScheduleId: schedule.id,
      })
      .where(
        and(
          eq(rentSchedules.id, id),
          eq(rentSchedules.mode, schedule.livemode ? "live" : "test"),
        ),
      );
    return;
  }
  if (
    event.type.startsWith("payment_intent.") ||
    event.type.startsWith("charge.")
  ) {
    const object = event.data.object as
      Stripe.PaymentIntent | Stripe.Charge | Stripe.Dispute;
    let intentId: string | null = event.type.startsWith("payment_intent.")
      ? object.id
      : null;
    if (!intentId && "payment_intent" in object)
      intentId =
        typeof object.payment_intent === "string"
          ? object.payment_intent
          : (object.payment_intent?.id ?? null);
    if (!intentId) return;
    const payments = await stripe().invoicePayments.list({
      payment: { type: "payment_intent", payment_intent: intentId },
      limit: 100,
    });
    for (const payment of payments.data) {
      const invoice =
        typeof payment.invoice === "string"
          ? await stripe().invoices.retrieve(payment.invoice)
          : payment.invoice;
      if (!("deleted" in invoice)) await reconcileInvoice(invoice);
    }
    return;
  }
  const payload = event.data.object as Stripe.Invoice;
  if (!payload.parent?.subscription_details?.metadata?.rentScheduleId) return;
  // Stripe events can arrive out of order. Reconcile the current provider record.
  const invoice = await stripe().invoices.retrieve(payload.id);
  await reconcileInvoice(invoice);
}
async function reconcileInvoice(invoice: Stripe.Invoice) {
  const d = db();
  const id = invoice.parent?.subscription_details?.metadata?.rentScheduleId;
  if (!id) return;
  const [schedule] = await d
    .select()
    .from(rentSchedules)
    .where(eq(rentSchedules.id, id));
  if (
    !schedule ||
    schedule.mode !== (invoice.livemode ? "live" : "test") ||
    schedule.stripeCustomerId !== invoice.customer ||
    invoice.currency !== "usd"
  )
    return;
  const payments = await stripe().invoicePayments.list({
    invoice: invoice.id,
    expand: ["data.payment.payment_intent"],
    limit: 100,
  });
  const intents = payments.data
    .map((p) => p.payment.payment_intent)
    .filter((p): p is Stripe.PaymentIntent => !!p && typeof p !== "string");
  const latest = intents.sort((a, b) => b.created - a.created)[0];
  const charge = latest?.latest_charge
    ? typeof latest.latest_charge === "string"
      ? await stripe().charges.retrieve(latest.latest_charge)
      : latest.latest_charge
    : null;
  const state = charge?.disputed
    ? "disputed"
    : charge?.refunded
      ? "refunded"
      : charge?.amount_refunded
        ? "partially_refunded"
        : charge?.status === "failed"
          ? "failed"
          : latest?.status === "processing"
            ? "processing"
            : invoice.status === "paid"
              ? "paid"
              : invoice.status === "void"
                ? "void"
                : invoice.status === "uncollectible"
                  ? "uncollectible"
                  : latest?.status === "requires_payment_method" &&
                      latest.last_payment_error
                    ? "failed"
                    : "open";
  const values = {
    id: invoiceUuid(invoice.id),
    propertyId: schedule.propertyId,
    payerName: schedule.payerName,
    payerEmail: schedule.payerEmail,
    category: "rent",
    description: invoice.lines.data[0]?.description ?? "Monthly rent",
    amountCents: invoice.amount_due,
    dueDate: new Date((invoice.due_date ?? invoice.created) * 1000)
      .toISOString()
      .slice(0, 10),
    mode: schedule.mode,
    stripeInvoiceId: invoice.id,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    billingScheduleId: id,
    status: state,
    paidAt:
      invoice.status === "paid"
        ? new Date(
            (invoice.status_transitions.paid_at ?? invoice.created) * 1000,
          )
        : null,
  };
  await d
    .insert(invoices)
    .values(values)
    .onConflictDoUpdate({
      target: invoices.stripeInvoiceId,
      set: {
        // Preserve settled/returned states if an older reconciliation finishes last.
        status: sql`case
          when ${invoices.status} in ('disputed','refunded') then ${invoices.status}
          when ${state} in ('disputed','refunded') then ${state}
          when ${invoices.status} = 'partially_refunded' then ${invoices.status}
          when ${invoices.status} = 'paid' and ${state} in ('open','processing') then 'paid'
          when ${invoices.status} in ('void','uncollectible') and ${state} in ('open','processing','failed') then ${invoices.status}
          else ${state} end`,
        hostedInvoiceUrl: values.hostedInvoiceUrl,
        paidAt: sql`coalesce(${invoices.paidAt},${values.paidAt})`,
      },
    });
}
