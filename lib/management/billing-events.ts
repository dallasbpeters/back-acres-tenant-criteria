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
        status: sql`case when ${rentSchedules.status} in ('canceled','completed','released') then ${rentSchedules.status} else ${schedule.status} end`,
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
  const payload = event.data.object as Stripe.Invoice;
  if (!payload.parent?.subscription_details?.metadata?.rentScheduleId) return;
  // Stripe events can arrive out of order. Reconcile the current provider record.
  const invoice = await stripe().invoices.retrieve(payload.id);
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
  const state =
    invoice.status === "paid"
      ? "paid"
      : invoice.status === "void"
        ? "void"
        : invoice.attempt_count > 0 && invoice.status === "open"
          ? "failed"
          : invoice.status === "uncollectible"
            ? "uncollectible"
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
        status: sql`case when ${invoices.status} = 'paid' or ${state} = 'paid' then 'paid' when ${invoices.status} in ('void','uncollectible') then ${invoices.status} else ${state} end`,
        hostedInvoiceUrl: values.hostedInvoiceUrl,
        paidAt: sql`coalesce(${invoices.paidAt},${values.paidAt})`,
      },
    });
}
