import "server-only";
import { createHash } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorizationReceipts } from "@/lib/db/schema";
import { requireValue } from "@/lib/required";
import { authorizationReceiptText } from "./authorization-receipt";
import { billingEvents, handleBillingEvent } from "./billing-events";
import { reconcileCheckoutSession } from "./checkout-events";
import { paymentMode, stripe } from "./stripe";

const batchResponse = z.object({
  data: z.array(z.object({ id: z.string().min(1) })),
});

export async function deliverAuthorizationReceipts(
  transport: typeof fetch = fetch
) {
  const d = db();
  const rows = await d
    .select()
    .from(authorizationReceipts)
    .where(isNull(authorizationReceipts.acceptedAt))
    .orderBy(authorizationReceipts.consentedAt, authorizationReceipts.id)
    .limit(50);
  if (!rows.length) {
    return 0;
  }
  if (!(process.env.RESEND_API_KEY && process.env.FROM_EMAIL)) {
    throw new Error("Authorization email is not configured.");
  }
  // All-or-nothing provider validation and one transaction keep a retried batch stable.
  const key = createHash("sha256")
    .update(rows.map((row) => row.id).join(":"))
    .digest("hex");
  const response = await transport("https://api.resend.com/emails/batch", {
    body: JSON.stringify(
      rows.map((row) => ({
        from: process.env.FROM_EMAIL,
        subject: "Your Back Acres ACH authorization copy",
        text: authorizationReceiptText(row),
        to: [row.recipient],
      }))
    ),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `ach-receipts-${key}`,
    },
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error("Authorization email was not accepted.");
  }
  const result = batchResponse.parse(await response.json());
  if (result.data.length !== rows.length) {
    throw new Error("Authorization email acceptance was incomplete.");
  }
  const updates = rows.map((row, index) =>
    d
      .update(authorizationReceipts)
      .set({ acceptedAt: new Date(), resendId: result.data[index].id })
      .where(eq(authorizationReceipts.id, row.id))
  );
  await d.batch([
    requireValue(updates[0], "Expected a pending receipt"),
    ...updates.slice(1),
  ]);
  return rows.length;
}

// Re-read current provider records after missed/delayed webhooks. This never
// creates charges, activates enrollments, retries debits, or changes authorizations.
export async function reconcileRecentPayments(now = Date.now()) {
  const client = stripe();
  const mode = paymentMode();
  let cursor: string | undefined;
  let count = 0;
  const seen = new Set<string>();
  for (let page = 0; page < 5; page += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: Stripe cursor pages and reconciliation must finish in order; failures stop the run for safe replay.
    const events = await client.events.list({
      created: { gte: Math.floor(now / 1000) - 3 * 86_400 },
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    });
    for (const event of events.data) {
      // biome-ignore lint/performance/noAwaitInLoops: Finish each current-record recovery before the next event.
      count += await recoverEvent(event, client, mode);
    }
    if (!events.has_more) {
      return count;
    }
    const next = events.data.at(-1)?.id;
    if (!next || seen.has(next)) {
      throw new Error("Invalid payment recovery cursor.");
    }
    seen.add(next);
    cursor = next;
  }
  throw new Error(
    "Payment recovery exceeds its bounded window; owner review required."
  );
}

async function recoverEvent(
  event: Stripe.Event,
  client: Stripe,
  mode: "test" | "live"
) {
  if (event.livemode !== (mode === "live")) {
    return 0;
  }
  if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
    ].includes(event.type) &&
    event.data.object.object === "checkout.session" &&
    event.data.object.mode === "payment"
  ) {
    const session = await client.checkout.sessions.retrieve(
      event.data.object.id
    );
    const response = await reconcileCheckoutSession(session, event.type);
    if (!response.ok) {
      throw new Error("Checkout recovery validation failed.");
    }
    return 1;
  }
  if (billingEvents.includes(event.type)) {
    await handleBillingEvent(event);
    return 1;
  }
  return 0;
}
