import { NextRequest } from "next/server";
import { and, eq, ne, or, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { reply } from "@/lib/adverse/auth";
import { stripe } from "@/lib/management/stripe";
import type Stripe from "stripe";
export async function POST(request: NextRequest) {
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return reply({ error: "Invalid webhook signature or configuration." }, 400);
  }
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
    ].includes(event.type)
  )
    return reply({ received: true });
  const session = event.data.object as Stripe.Checkout.Session;
  const id = session.metadata?.invoiceId;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return reply({ received: true });
  try {
    const d = db();
    const [invoice] = await d
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));
    if (
      !invoice ||
      session.client_reference_id !== id ||
      session.amount_total !== invoice.amountCents ||
      session.currency !== "usd" ||
      (invoice.stripeSessionId && invoice.stripeSessionId !== session.id)
    )
      return reply({ error: "Invoice mismatch." }, 400);
    const paid = session.payment_status === "paid";
    const status = paid
      ? "paid"
      : event.type === "checkout.session.async_payment_failed"
        ? "failed"
        : "processing";
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
          ne(invoices.status, "paid"),
          or(
            isNull(invoices.stripeSessionId),
            eq(invoices.stripeSessionId, session.id),
          ),
        ),
      );
    return reply({ received: true });
  } catch {
    return reply({ error: "Could not record payment. Retry this event." }, 503);
  }
}
