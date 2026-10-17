import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { properties, rentSchedules } from "@/lib/db/schema";
import { guard, readBody, reply } from "@/lib/adverse/auth";
import { rentScheduleSchema } from "@/lib/management/model";
import { stopAutopay } from "@/lib/management/autopay";
import { stripe, paymentMode, paymentReady } from "@/lib/management/stripe";
const command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    id: z.string().uuid(),
    data: rentScheduleSchema,
  }),
  z.object({ action: z.literal("cancel"), id: z.string().uuid() }),
]);
export async function POST(request: NextRequest) {
  const denied = await guard(request);
  if (denied) return denied;
  if (!paymentReady())
    return reply(
      { error: "Configure Stripe before creating a rent schedule." },
      503,
    );
  const parsed = command.safeParse(await readBody(request).catch(() => null));
  if (!parsed.success)
    return reply(
      { error: "Complete the rent amount, payer, dates, and authorization." },
      400,
    );
  const c = parsed.data,
    d = db(),
    client = stripe();
  try {
    if (c.action === "cancel") {
      const [r] = await d
        .select()
        .from(rentSchedules)
        .where(eq(rentSchedules.id, c.id));
      if (!r || r.mode !== paymentMode())
        return reply(
          {
            error: "This schedule is in another environment or does not exist.",
          },
          409,
        );
      if (r.status === "canceled" || r.status === "completed")
        return reply({ ok: true });
      if (r.collection === "ach") {
        await stopAutopay(r.id);
        return reply({ ok: true });
      }
      if (!r.stripeScheduleId)
        return reply(
          { error: "This schedule needs reconciliation in Stripe." },
          409,
        );
      await client.subscriptionSchedules.cancel(r.stripeScheduleId, {
        invoice_now: false,
        prorate: false,
      });
      await d
        .update(rentSchedules)
        .set({ status: "canceled" })
        .where(eq(rentSchedules.id, c.id));
      return reply({ ok: true });
    }
    const b = c.data;
    const today = new Date().toISOString().slice(0, 10),
      date = new Date(b.firstDate + "T12:00:00Z");
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== b.firstDate ||
      b.firstDate < today ||
      (b.collection === "ach" && b.firstDate === today) ||
      date.getUTCDate() > 28
    )
      return reply(
        {
          error:
            "Choose day 1–28 of the month. ACH enrollment requires a future date.",
        },
        400,
      );
    const [existing] = await d
      .select()
      .from(rentSchedules)
      .where(eq(rentSchedules.id, c.id));
    if (existing && existing.mode !== paymentMode())
      return reply(
        { error: "This schedule belongs to another payment environment." },
        409,
      );
    if (existing)
      return existing.stripeScheduleId ||
        (existing.collection === "ach" &&
          existing.status === "awaiting_authorization")
        ? reply({ ok: true })
        : reply(
            {
              error:
                "This request is already processing or needs review in Stripe. Do not create a duplicate.",
            },
            409,
          );
    const [duplicate] = await d
      .select()
      .from(rentSchedules)
      .where(
        and(
          eq(rentSchedules.propertyId, b.propertyId),
          eq(rentSchedules.payerEmail, b.payerEmail),
          eq(rentSchedules.mode, paymentMode()),
          inArray(rentSchedules.status, [
            "creating",
            "not_started",
            "active",
            "needs_review",
            "awaiting_authorization",
            "creating_checkout",
            "awaiting_verification",
            "activating",
            "canceling",
          ]),
        ),
      );
    if (duplicate)
      return reply(
        {
          error:
            "This payer already has a rent schedule for this property. Review it before adding another.",
        },
        409,
      );
    const [property] = await d
      .select()
      .from(properties)
      .where(eq(properties.id, b.propertyId));
    if (!property) return reply({ error: "Property not found." }, 404);
    await d.insert(rentSchedules).values({
      id: c.id,
      propertyId: b.propertyId,
      payerName: b.payerName,
      payerEmail: b.payerEmail,
      monthlyCents: b.monthlyCents,
      firstDate: b.firstDate,
      installments: b.installments,
      mode: paymentMode(),
      collection: b.collection,
      status: b.collection === "ach" ? "awaiting_authorization" : "creating",
    });
    if (b.collection === "ach") return reply({ ok: true });
    const customer = await client.customers.create(
      {
        name: b.payerName,
        email: b.payerEmail,
        metadata: { rentScheduleId: c.id },
      },
      { idempotencyKey: `rent-customer-${c.id}` },
    );
    await d
      .update(rentSchedules)
      .set({ stripeCustomerId: customer.id })
      .where(eq(rentSchedules.id, c.id));
    const product = await client.products.create(
      {
        name: `Monthly rent · ${property.data.name}`,
        metadata: { rentScheduleId: c.id },
      },
      { idempotencyKey: `rent-product-${c.id}` },
    );
    const schedule = await client.subscriptionSchedules.create(
      {
        customer: customer.id,
        start_date:
          b.firstDate === today ? "now" : Math.floor(date.getTime() / 1000),
        end_behavior: "cancel",
        metadata: { rentScheduleId: c.id },
        default_settings: {
          collection_method: "send_invoice",
          invoice_settings: { days_until_due: 0 },
        },
        phases: [
          {
            duration: { interval: "month", interval_count: b.installments },
            billing_cycle_anchor: "phase_start",
            proration_behavior: "none",
            metadata: { rentScheduleId: c.id },
            items: [
              {
                price_data: {
                  currency: "usd",
                  product: product.id,
                  unit_amount: b.monthlyCents,
                  recurring: { interval: "month" },
                },
                quantity: 1,
              },
            ],
          },
        ],
      },
      { idempotencyKey: `rent-schedule-${c.id}` },
    );
    await d
      .update(rentSchedules)
      .set({ stripeScheduleId: schedule.id, status: schedule.status })
      .where(eq(rentSchedules.id, c.id));
    return reply({ ok: true });
  } catch {
    if (c.action === "create")
      await d
        .update(rentSchedules)
        .set({ status: "needs_review" })
        .where(
          and(eq(rentSchedules.id, c.id), eq(rentSchedules.status, "creating")),
        )
        .catch(() => {});
    return reply(
      {
        error:
          "Stripe could not complete this request. Review the schedule in Stripe before retrying; no automatic duplicate will be created.",
      },
      503,
    );
  }
}
