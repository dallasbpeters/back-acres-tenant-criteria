import { requireValue } from "@/lib/required";

const pattern1 = /^(sk|rk)_live_/;
const pattern2 = /^(sk|rk)_live_/;
const quotePattern = /^["']|["']$/g;
const keyPrefixPattern = /^(sk|rk|pk)_(live|test)_/;

import "server-only";
import Stripe from "stripe";

/** An env value without stray spaces or wrapping quotes from pasting. */
const clean = (value: string | undefined) =>
  (value ?? "").trim().replace(quotePattern, "");
export const stripeSecretKey = () => clean(process.env.STRIPE_SECRET_KEY);
export const stripeWebhookSecret = () =>
  clean(process.env.STRIPE_WEBHOOK_SECRET);
/**
 * Which kind of key is loaded, for the owner: its prefix only, such as
 * "sk_live_". Never the key itself.
 */
export function stripeKeyKind() {
  const prefix = keyPrefixPattern.exec(stripeSecretKey())?.[0];
  return prefix ?? (stripeSecretKey() ? "an unrecognized key" : "no key");
}
export function paymentMode(): "test" | "live" {
  return pattern1.test(stripeSecretKey()) ? "live" : "test";
}
export function paymentReady() {
  const key = stripeSecretKey();
  return !!(
    key &&
    stripeWebhookSecret() &&
    (!pattern2.test(key) ||
      process.env.PAYMENTS_LIVE_ENABLED?.trim() === "true")
  );
}
export function stripe() {
  if (!paymentReady()) {
    throw new Error("Payments are not configured.");
  }
  return new Stripe(
    requireValue(stripeSecretKey(), "Expected process.env.STRIPE_SECRET_KEY")
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
