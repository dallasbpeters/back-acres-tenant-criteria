import "server-only";
import { and, eq, isNull, ne, notInArray, or } from "drizzle-orm";
import type Stripe from "stripe";
import { reply } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";

const pattern1 = /^[0-9a-f-]{36}$/;

// Shared by signed webhooks and authenticated Stripe API recovery.
export async function reconcileCheckoutSession(
  session: Stripe.Checkout.Session,
  eventType: string
) {
  const id = session.metadata?.invoiceId;
  if (!(id && pattern1.test(id))) {
    return reply({ received: true });
  }
  try {
    const d = db();
    const [invoice] = await d
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));
    if (
      !invoice ||
      (invoice.mode === "live") !== session.livemode ||
      session.client_reference_id !== id ||
      session.amount_total !== invoice.amountCents ||
      session.currency !== "usd" ||
      (invoice.stripeSessionId && invoice.stripeSessionId !== session.id)
    ) {
      return reply({ error: "Invoice mismatch." }, 400);
    }
    const paid = session.payment_status === "paid";
    const resolveStatus1 = () => {
      if (paid) {
        return "paid";
      }
      if (eventType === "checkout.session.async_payment_failed") {
        return "failed";
      }
      return "processing";
    };
    const status = resolveStatus1();
    await d
      .update(invoices)
      .set({
        status,
        stripeSessionId: session.id,
        ...(paid ? { paidAt: new Date() } : {}),
      })
      .where(
        and(
          eq(invoices.id, id),
          notInArray(invoices.status, [
            "paid",
            "refunded",
            "partially_refunded",
            "disputed",
          ]),
          // A delayed completion must not reopen a bank payment that failed.
          ...(status === "processing" ? [ne(invoices.status, "failed")] : []),
          or(
            isNull(invoices.stripeSessionId),
            eq(invoices.stripeSessionId, session.id)
          )
        )
      );
    return reply({ received: true });
  } catch {
    return reply({ error: "Could not record payment. Retry this event." }, 503);
  }
}
