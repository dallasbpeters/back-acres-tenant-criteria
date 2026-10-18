import { requireValue } from "@/lib/required";

const pattern1 = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { invoices, rentSchedules } from "@/lib/db/schema";
import { collectStripePages, stripe } from "./stripe";

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
/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps the ordered validation, state transitions, and fallback rendering together; its externally visible branches are covered by workflow tests. */
export async function handleBillingEvent(event: Stripe.Event) {
  const d = db();
  if (event.type.startsWith("subscription_schedule.")) {
    const payload = event.data.object as Stripe.SubscriptionSchedule;
    if (!payload.metadata?.rentScheduleId) {
      return;
    }
    const schedule = await stripe().subscriptionSchedules.retrieve(payload.id),
      id = schedule.metadata?.rentScheduleId;
    if (!id) {
      return;
    }
    await d
      .update(rentSchedules)
      .set({
        status: sql`case when ${rentSchedules.status} in ('canceled','canceling','completed','released') then ${rentSchedules.status} else ${schedule.status} end`,
        stripeScheduleId: schedule.id,
      })
      .where(
        and(
          eq(rentSchedules.id, id),
          eq(rentSchedules.mode, schedule.livemode ? "live" : "test")
        )
      );
    return;
  }
  if (
    event.type.startsWith("payment_intent.") ||
    event.type.startsWith("charge.")
  ) {
    const object = event.data.object as
      | Stripe.PaymentIntent
      | Stripe.Charge
      | Stripe.Dispute;
    let intentId: string | null = event.type.startsWith("payment_intent.")
      ? object.id
      : null;
    if (!intentId && "payment_intent" in object) {
      intentId =
        typeof object.payment_intent === "string"
          ? object.payment_intent
          : (object.payment_intent?.id ?? null);
    }
    if (!intentId) {
      return;
    }
    const payments = await collectStripePages((cursor) =>
      stripe().invoicePayments.list({
        limit: 100,
        payment: {
          payment_intent: requireValue(intentId, "Expected intentId"),
          type: "payment_intent",
        },
        ...(cursor ? { starting_after: cursor } : {}),
      })
    );
    // Checkout payments have no Stripe Invoice. Reconcile their returns and
    // disputes too, using the current intent rather than the event snapshot.
    if (!payments.length) {
      await reconcileCheckoutPayment(intentId);
    }
    for (const payment of payments) {
      const invoice =
        typeof payment.invoice === "string"
          ? /* biome-ignore lint/performance/noAwaitInLoops: Each step depends on the preceding provider/database state or output order; parallel execution would change recovery semantics. */ await stripe().invoices.retrieve(
              payment.invoice
            )
          : payment.invoice;
      if (!("deleted" in invoice)) {
        await reconcileInvoice(invoice);
      }
    }
    return;
  }
  const payload = event.data.object as Stripe.Invoice;
  if (!payload.parent?.subscription_details?.metadata?.rentScheduleId) {
    return;
  }
  // Stripe events can arrive out of order. Reconcile the current provider record.
  const invoice = await stripe().invoices.retrieve(payload.id);
  await reconcileInvoice(invoice);
}
async function reconcileInvoice(invoice: Stripe.Invoice) {
  const d = db();
  const id = invoice.parent?.subscription_details?.metadata?.rentScheduleId;
  if (!id) {
    return;
  }
  const [schedule] = await d
    .select()
    .from(rentSchedules)
    .where(eq(rentSchedules.id, id));
  if (
    !schedule ||
    schedule.mode !== (invoice.livemode ? "live" : "test") ||
    schedule.stripeCustomerId !== invoice.customer ||
    invoice.currency !== "usd"
  ) {
    return;
  }
  const payments = await collectStripePages((cursor) =>
    stripe().invoicePayments.list({
      expand: ["data.payment.payment_intent"],
      invoice: invoice.id,
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    })
  );
  const intents = payments
    .map((p) => p.payment.payment_intent)
    .filter((p): p is Stripe.PaymentIntent => !!p && typeof p !== "string");
  const [latest] = intents.sort((a, b) => b.created - a.created);
  const resolveCharge1 = async () => {
    if (latest?.latest_charge) {
      if (typeof latest.latest_charge === "string") {
        return await stripe().charges.retrieve(latest.latest_charge);
      }
      return latest.latest_charge;
    }
    return null;
  };
  const charge = await resolveCharge1();
  const resolveState2 = () => {
    if (charge?.disputed) {
      return "disputed";
    }
    if (charge?.refunded) {
      return "refunded";
    }
    if (charge?.amount_refunded) {
      return "partially_refunded";
    }
    if (charge?.status === "failed") {
      return "failed";
    }
    if (latest?.status === "processing") {
      return "processing";
    }
    if (invoice.status === "paid") {
      return "paid";
    }
    if (invoice.status === "void") {
      return "void";
    }
    if (invoice.status === "uncollectible") {
      return "uncollectible";
    }
    if (
      latest?.status === "requires_payment_method" &&
      latest.last_payment_error
    ) {
      return "failed";
    }
    return "open";
  };
  const state = resolveState2();
  const values = {
    amountCents: invoice.amount_due,
    billingScheduleId: id,
    category: "rent",
    description: invoice.lines.data[0]?.description ?? "Monthly rent",
    dueDate: new Date((invoice.due_date ?? invoice.created) * 1000)
      .toISOString()
      .slice(0, 10),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    id: invoiceUuid(invoice.id),
    mode: schedule.mode,
    paidAt:
      invoice.status === "paid"
        ? new Date(
            (invoice.status_transitions.paid_at ?? invoice.created) * 1000
          )
        : null,
    payerEmail: schedule.payerEmail,
    payerName: schedule.payerName,
    propertyId: schedule.propertyId,
    status: state,
    stripeInvoiceId: invoice.id,
  };
  await d
    .insert(invoices)
    .values(values)
    .onConflictDoUpdate({
      set: {
        hostedInvoiceUrl: values.hostedInvoiceUrl,
        paidAt: sql`coalesce(${invoices.paidAt},${values.paidAt})`,
        // Preserve settled/returned states if an older reconciliation finishes last.
        status: sql`case
          when ${invoices.status} in ('disputed','refunded') then ${invoices.status}
          when ${state} in ('disputed','refunded') then ${state}
          when ${invoices.status} = 'partially_refunded' then ${invoices.status}
          when ${invoices.status} = 'paid' and ${state} in ('open','processing') then 'paid'
          when ${invoices.status} in ('void','uncollectible') and ${state} in ('open','processing','failed') then ${invoices.status}
          else ${state} end`,
      },
      target: invoices.stripeInvoiceId,
    });
}
async function reconcileCheckoutPayment(intentId: string) {
  const client = stripe();
  const sessions = await collectStripePages((cursor) =>
    client.checkout.sessions.list({
      limit: 100,
      payment_intent: intentId,
      ...(cursor ? { starting_after: cursor } : {}),
    })
  );
  for (const session of sessions) {
    const id = session.metadata?.invoiceId;
    if (!(id && pattern1.test(id))) {
      continue;
    }
    const d = db();
    const [invoice] =
      /* biome-ignore lint/performance/noAwaitInLoops: Each step depends on the preceding provider/database state or output order; parallel execution would change recovery semantics. */ await d
        .select()
        .from(invoices)
        .where(eq(invoices.id, id));
    if (
      !invoice ||
      invoice.stripeInvoiceId ||
      invoice.stripeSessionId !== session.id ||
      invoice.mode !== (session.livemode ? "live" : "test") ||
      session.client_reference_id !== id ||
      session.amount_total !== invoice.amountCents ||
      session.currency !== "usd"
    ) {
      continue;
    }
    const intent = await client.paymentIntents.retrieve(intentId, {
      expand: ["latest_charge"],
    });
    if (
      intent.livemode !== session.livemode ||
      intent.amount !== invoice.amountCents ||
      intent.currency !== "usd"
    ) {
      continue;
    }
    const charge =
      typeof intent.latest_charge === "string"
        ? await client.charges.retrieve(intent.latest_charge)
        : intent.latest_charge;
    const resolveStatus3 = () => {
      if (charge?.disputed) {
        return "disputed";
      }
      if (charge?.refunded) {
        return "refunded";
      }
      if (charge?.amount_refunded) {
        return "partially_refunded";
      }
      if (
        charge?.status === "failed" ||
        (intent.status === "requires_payment_method" &&
          intent.last_payment_error)
      ) {
        return "failed";
      }
      if (intent.status === "succeeded") {
        return "paid";
      }
      if (intent.status === "processing") {
        return "processing";
      }
      return null;
    };
    const status = resolveStatus3();
    if (!status) {
      continue;
    }
    await d
      .update(invoices)
      .set({
        status: sql`case
        when ${invoices.status} in ('disputed','refunded') then ${invoices.status}
        when ${status} in ('disputed','refunded','partially_refunded','failed') then ${status}
        when ${invoices.status} in ('partially_refunded','paid','failed') and ${status} = 'processing' then ${invoices.status}
        when ${invoices.status} = 'partially_refunded' and ${status} = 'paid' then ${invoices.status}
        else ${status} end`,
        ...(status === "paid"
          ? { paidAt: sql`coalesce(${invoices.paidAt},now())` }
          : {}),
      })
      .where(
        and(eq(invoices.id, id), eq(invoices.stripeSessionId, session.id))
      );
  }
}
