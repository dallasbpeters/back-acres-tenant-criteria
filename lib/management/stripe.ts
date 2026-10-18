import { requireValue } from "@/lib/required";

const pattern1 = /^(sk|rk)_live_/;
const pattern2 = /^(sk|rk)_live_/;

import "server-only";
import Stripe from "stripe";
export function paymentMode(): "test" | "live" {
  return pattern1.test(process.env.STRIPE_SECRET_KEY ?? "") ? "live" : "test";
}
export function paymentReady() {
  const key = process.env.STRIPE_SECRET_KEY;
  return !!(
    key &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    (!pattern2.test(key) || process.env.PAYMENTS_LIVE_ENABLED === "true")
  );
}
export function stripe() {
  if (!paymentReady()) {
    throw new Error("Payments are not configured.");
  }
  return new Stripe(
    requireValue(
      process.env.STRIPE_SECRET_KEY,
      "Expected process.env.STRIPE_SECRET_KEY"
    )
  );
}

// Stripe list endpoints default to one page. Reconciliation must not silently
// omit an older schedule or payment when the first page is full.
export async function collectStripePages<T extends { id: string }>(
  fetchPage: (cursor?: string) => Promise<{ data: T[]; has_more?: boolean }>
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page =
      /* biome-ignore lint/performance/noAwaitInLoops: Each step depends on the preceding provider/database state or output order; parallel execution would change recovery semantics. */ await fetchPage(
        cursor
      );
    rows.push(...page.data);
    if (!page.has_more) {
      return rows;
    }
    const next = page.data.at(-1)?.id;
    if (!next || seen.has(next)) {
      throw new Error("Stripe returned an invalid pagination cursor.");
    }
    seen.add(next);
    cursor = next;
  }
}
