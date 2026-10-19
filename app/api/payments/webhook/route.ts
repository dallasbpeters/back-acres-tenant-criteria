import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { reply } from "@/lib/adverse/auth";
import { autopayEvents, handleAutopayEvent } from "@/lib/management/autopay";
import {
  billingEvents,
  handleBillingEvent,
} from "@/lib/management/billing-events";
import { reconcileCheckoutSession } from "@/lib/management/checkout-events";
import { stripe, stripeWebhookSecret } from "@/lib/management/stripe";
import { requireValue } from "@/lib/required";
export async function POST(request: NextRequest) {
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      requireValue(
        stripeWebhookSecret(),
        "Expected process.env.STRIPE_WEBHOOK_SECRET"
      )
    );
  } catch {
    return reply({ error: "Invalid webhook signature or configuration." }, 400);
  }
  if (
    autopayEvents.includes(event.type) ||
    (event.type === "checkout.session.completed" &&
      (event.data.object as Stripe.Checkout.Session).mode === "setup")
  ) {
    try {
      await handleAutopayEvent(event);
      return reply({ received: true });
    } catch {
      return reply({ error: "Could not reconcile bank enrollment." }, 503);
    }
  }
  if (billingEvents.includes(event.type)) {
    try {
      await handleBillingEvent(event);
      return reply({ received: true });
    } catch {
      return reply({ error: "Could not record billing event." }, 503);
    }
  }
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
    ].includes(event.type)
  ) {
    return reply({ received: true });
  }
  return reconcileCheckoutSession(
    event.data.object as Stripe.Checkout.Session,
    event.type
  );
}
