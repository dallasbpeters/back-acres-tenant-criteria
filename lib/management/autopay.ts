import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { rentSchedules } from "@/lib/db/schema";
import { stripe, paymentMode } from "./stripe";
import { dollars } from "./model";
type Schedule = typeof rentSchedules.$inferSelect;
export function authorizationText(r: Schedule) {
  return `I authorize Back Acres Rental to debit my US bank account ${dollars(r.monthlyCents)} monthly for ${r.installments} payments, beginning ${r.firstDate}, on the same calendar day each month. Total scheduled: ${dollars(r.monthlyCents * r.installments)}. Debits are initiated at 12:00 UTC; bank posting may occur later, including after weekends or holidays. This authorization covers rent only, with no automatic renewal or variable charges. I can stop future debits using this private link or by contacting the owner. Canceling does not cancel my lease or reverse payments already submitted. I will keep a copy of these terms and the Stripe mandate.`;
}
export async function stopAutopay(id: string) {
  const d = db();
  const [r] = await d
    .update(rentSchedules)
    .set({ status: "canceling" })
    .where(
      and(
        eq(rentSchedules.id, id),
        eq(rentSchedules.collection, "ach"),
        eq(rentSchedules.mode, paymentMode()),
        inArray(rentSchedules.status, [
          "awaiting_authorization",
          "creating_checkout",
          "awaiting_verification",
          "active",
          "not_started",
          "needs_review",
          "canceling",
        ]),
      ),
    )
    .returning();
  if (!r) {
    const [current] = await d
      .select()
      .from(rentSchedules)
      .where(eq(rentSchedules.id, id));
    if (current && ["canceled", "completed"].includes(current.status)) return;
    throw new Error(
      "Enrollment is being activated. Refresh and try stopping payments again.",
    );
  }
  const client = stripe();
  // An API timeout may have left a provider schedule without a saved local ID.
  const schedules = r.stripeScheduleId
    ? [await client.subscriptionSchedules.retrieve(r.stripeScheduleId)]
    : r.stripeCustomerId
      ? (
          await client.subscriptionSchedules.list({
            customer: r.stripeCustomerId,
            limit: 100,
          })
        ).data.filter((s) => s.metadata?.rentScheduleId === id)
      : [];
  for (const s of schedules) {
    if (["active", "not_started"].includes(s.status))
      await client.subscriptionSchedules.cancel(s.id, {
        invoice_now: false,
        prorate: false,
      });
  }
  if (r.setupSessionId) {
    const session = await client.checkout.sessions.retrieve(r.setupSessionId);
    if (session.status === "open")
      await client.checkout.sessions.expire(session.id);
    const intentId =
      typeof session.setup_intent === "string"
        ? session.setup_intent
        : session.setup_intent?.id;
    if (intentId) {
      const si = await client.setupIntents.retrieve(intentId);
      if (!["succeeded", "canceled"].includes(si.status))
        await client.setupIntents.cancel(si.id);
    }
  }
  await d
    .update(rentSchedules)
    .set({ status: "canceled" })
    .where(eq(rentSchedules.id, id));
}
export async function activateAutopay(intentId: string) {
  const client = stripe(),
    intent = await client.setupIntents.retrieve(intentId);
  const id = intent.metadata?.rentScheduleId;
  if (!id) return;
  const d = db();
  const [r] = await d
    .select()
    .from(rentSchedules)
    .where(eq(rentSchedules.id, id));
  if (
    !r ||
    r.collection !== "ach" ||
    r.mode !== (intent.livemode ? "live" : "test") ||
    r.mode !== paymentMode() ||
    r.stripeCustomerId !== intent.customer ||
    !r.consentedAt ||
    !r.setupSessionId
  )
    return;
  const session = await client.checkout.sessions.retrieve(r.setupSessionId);
  if (
    session.setup_intent !== intent.id ||
    session.client_reference_id !== r.id
  )
    return;
  if (intent.status !== "succeeded") {
    if (["creating_checkout", "awaiting_verification"].includes(r.status))
      await d
        .update(rentSchedules)
        .set({
          setupIntentId: intent.id,
          status:
            intent.status === "canceled"
              ? "needs_review"
              : "awaiting_verification",
        })
        .where(
          and(
            eq(rentSchedules.id, id),
            inArray(rentSchedules.status, [
              "creating_checkout",
              "awaiting_verification",
            ]),
          ),
        );
    return;
  }
  const methodId =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : intent.payment_method?.id;
  if (!methodId || !intent.mandate)
    throw new Error("Verified bank mandate required.");
  const mandate = await client.mandates.retrieve(
    typeof intent.mandate === "string" ? intent.mandate : intent.mandate.id,
  );
  if (mandate.status !== "active")
    throw new Error("Bank mandate is no longer active.");
  const method = await client.paymentMethods.retrieve(methodId);
  if (
    method.type !== "us_bank_account" ||
    method.customer !== r.stripeCustomerId
  )
    throw new Error("Bank account mismatch.");
  if (
    r.stripeScheduleId ||
    ["canceled", "canceling", "completed", "released"].includes(r.status)
  )
    return;
  const start = Math.floor(
    new Date(r.firstDate + "T12:00:00Z").getTime() / 1000,
  );
  if (start <= Date.now() / 1000) {
    await d
      .update(rentSchedules)
      .set({ status: "needs_review", setupIntentId: intent.id })
      .where(
        and(
          eq(rentSchedules.id, id),
          inArray(rentSchedules.status, [
            "creating_checkout",
            "awaiting_verification",
            "activating",
          ]),
        ),
      );
    return;
  }
  const [claim] = await d
    .update(rentSchedules)
    .set({
      status: "activating",
      setupIntentId: intent.id,
      stripePaymentMethodId: methodId,
    })
    .where(
      and(
        eq(rentSchedules.id, id),
        inArray(rentSchedules.status, [
          "creating_checkout",
          "awaiting_verification",
          "activating",
        ]),
      ),
    )
    .returning();
  if (!claim) return;
  // Check provider metadata before retrying, even beyond Stripe's idempotency window.
  const existing = (
    await client.subscriptionSchedules.list({
      customer: r.stripeCustomerId!,
      limit: 100,
    })
  ).data.find((s) => s.metadata?.rentScheduleId === id);
  const product = existing
    ? null
    : await client.products.create(
        { name: "Back Acres monthly rent", metadata: { rentScheduleId: id } },
        { idempotencyKey: `ach-product-${id}` },
      );
  const schedule =
    existing ??
    (await client.subscriptionSchedules.create(
      {
        customer: r.stripeCustomerId!,
        start_date: start,
        end_behavior: "cancel",
        metadata: { rentScheduleId: id },
        default_settings: {
          collection_method: "charge_automatically",
          default_payment_method: methodId,
        },
        phases: [
          {
            duration: { interval: "month", interval_count: r.installments },
            billing_cycle_anchor: "phase_start",
            proration_behavior: "none",
            metadata: { rentScheduleId: id },
            items: [
              {
                price_data: {
                  currency: "usd",
                  product: product!.id,
                  unit_amount: r.monthlyCents,
                  recurring: { interval: "month" },
                },
                quantity: 1,
              },
            ],
          },
        ],
      },
      { idempotencyKey: `ach-schedule-${id}` },
    ));
  await d
    .update(rentSchedules)
    .set({ stripeScheduleId: schedule.id, status: schedule.status })
    .where(
      and(eq(rentSchedules.id, id), eq(rentSchedules.status, "activating")),
    );
}
export const autopayEvents = [
  "mandate.updated",
  "setup_intent.succeeded",
  "setup_intent.setup_failed",
  "setup_intent.canceled",
  "setup_intent.requires_action",
];
export async function handleAutopayEvent(event: Stripe.Event) {
  if (event.type === "mandate.updated") {
    const payload = event.data.object as Stripe.Mandate;
    const mandate = await stripe().mandates.retrieve(payload.id);
    if (mandate.status !== "inactive") return;
    const methodId =
      typeof mandate.payment_method === "string"
        ? mandate.payment_method
        : mandate.payment_method.id;
    const rows = await db()
      .select()
      .from(rentSchedules)
      .where(
        and(
          eq(rentSchedules.stripePaymentMethodId, methodId),
          eq(rentSchedules.mode, mandate.livemode ? "live" : "test"),
          inArray(rentSchedules.status, [
            "active",
            "not_started",
            "canceling",
            "activating",
          ]),
        ),
      );
    for (const r of rows) await stopAutopay(r.id);
    return;
  }
  if (event.type.startsWith("setup_intent.")) {
    const intent = event.data.object as Stripe.SetupIntent;
    if (intent.metadata?.rentScheduleId) await activateAutopay(intent.id);
    return;
  }
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "setup" || !session.metadata?.rentScheduleId) return;
  const current = await stripe().checkout.sessions.retrieve(session.id);
  const intentId =
    typeof current.setup_intent === "string"
      ? current.setup_intent
      : current.setup_intent?.id;
  if (intentId) await activateAutopay(intentId);
}
