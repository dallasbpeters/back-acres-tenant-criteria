import "server-only";
import Stripe from "stripe";
export function paymentReady() {
  const key = process.env.STRIPE_SECRET_KEY;
  return !!(
    key &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    (!/^(sk|rk)_live_/.test(key) ||
      process.env.PAYMENTS_LIVE_ENABLED === "true")
  );
}
export function stripe() {
  if (!paymentReady()) throw new Error("Payments are not configured.");
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
