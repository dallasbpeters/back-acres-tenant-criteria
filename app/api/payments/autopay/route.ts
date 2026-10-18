import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { readBody, reply, sameOrigin } from "@/lib/adverse/auth";
import { db } from "@/lib/db";
import { rentSchedules } from "@/lib/db/schema";
import { authorizationText, stopAutopay } from "@/lib/management/autopay";
import { notRemoved } from "@/lib/management/not-removed";
import { allowIntake, siteUrl, tokenId } from "@/lib/management/security";
import { paymentMode, paymentReady, stripe } from "@/lib/management/stripe";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return reply({ error: "Invalid origin." }, 403);
  }
  if (!paymentReady()) {
    return reply({ error: "Payments are not configured." }, 503);
  }
  const parsed = z
    .object({
      action: z.enum(["enroll", "stop"]),
      authorized: z.boolean().optional(),
      token: z.string().max(110),
    })
    .safeParse(await readBody(request).catch(() => null));
  if (!parsed.success) {
    return reply({ error: "Invalid request." }, 400);
  }
  const b = parsed.data,
    id = tokenId("autopay", b.token);
  if (!id) {
    return reply({ error: "Invalid enrollment link." }, 404);
  }
  try {
    const d = db(),
      client = stripe();
    const [r] = await d
      .select()
      .from(rentSchedules)
      .where(and(eq(rentSchedules.id, id), notRemoved(rentSchedules.id)));
    if (r?.collection !== "ach" || r.mode !== paymentMode()) {
      return reply(
        { error: "Enrollment not available in this environment." },
        404
      );
    }
    // Stopping payments must remain available even if the enrollment rate limit is exhausted.
    if (b.action === "stop") {
      await stopAutopay(id);
      return reply({ ok: true });
    }
    if (!b.authorized) {
      return reply(
        { error: "Review and accept the payment authorization." },
        400
      );
    }
    if (
      ![
        "awaiting_authorization",
        "creating_checkout",
        "awaiting_verification",
      ].includes(r.status)
    ) {
      return reply(
        {
          error: "Enrollment is closed or already active. Refresh for status.",
        },
        409
      );
    }
    if (r.firstDate <= new Date().toISOString().slice(0, 10)) {
      return reply(
        {
          error:
            "The enrollment deadline passed. Ask Back Acres Rentals for a new schedule.",
        },
        409
      );
    }
    if (!(await allowIntake(request, `autopay:${id}`))) {
      return reply(
        { error: "Please wait before trying enrollment again." },
        429
      );
    }
    if (r.setupSessionId) {
      const session = await client.checkout.sessions.retrieve(r.setupSessionId);
      if (session.status === "open" && session.url) {
        return reply({ url: session.url });
      }
      return reply(
        {
          error:
            "Bank setup is submitted or expired. Refresh for verification instructions, or ask Back Acres Rentals for a new enrollment.",
        },
        409
      );
    }
    const [claim] = await d
      .update(rentSchedules)
      .set({
        authorizationText: authorizationText(r),
        consentedAt: new Date(),
        status: "creating_checkout",
      })
      .where(
        and(
          eq(rentSchedules.id, id),
          eq(rentSchedules.status, "awaiting_authorization")
        )
      )
      .returning();
    if (!claim) {
      return reply(
        {
          error:
            "Enrollment is being prepared. Refresh shortly; do not create a duplicate.",
        },
        409
      );
    }
    const customer = await client.customers.create(
      {
        email: r.payerEmail,
        metadata: { rentScheduleId: id },
        name: r.payerName,
      },
      { idempotencyKey: `ach-customer-${id}` }
    );
    await d
      .update(rentSchedules)
      .set({ stripeCustomerId: customer.id })
      .where(and(eq(rentSchedules.id, id), notRemoved(rentSchedules.id)));
    const session = await client.checkout.sessions.create(
      {
        allowed_payment_method_types: ["us_bank_account"],
        cancel_url: `${siteUrl()}/autopay/${b.token}`,
        client_reference_id: id,
        currency: "usd",
        custom_text: { submit: { message: authorizationText(r) } },
        customer: customer.id,
        integration_identifier: `back-acres-ach-${Array.from(randomBytes(8), (n) => String.fromCharCode(97 + (n % 26))).join("")}`,
        metadata: { rentScheduleId: id },
        mode: "setup",
        setup_intent_data: { metadata: { rentScheduleId: id } },
        success_url: `${siteUrl()}/autopay/${b.token}?submitted=1`,
      },
      { idempotencyKey: `ach-setup-${id}` }
    );
    const [saved] = await d
      .update(rentSchedules)
      .set({ setupSessionId: session.id, status: "awaiting_verification" })
      .where(
        and(
          eq(rentSchedules.id, id),
          eq(rentSchedules.status, "creating_checkout")
        )
      )
      .returning();
    if (!saved) {
      if (session.status === "open") {
        await client.checkout.sessions.expire(session.id);
      }
      return reply({ error: "This enrollment was stopped." }, 409);
    }
    return reply({ url: session.url });
  } catch {
    return reply(
      {
        error:
          "Could not complete this request. Refresh for status or contact Back Acres Rentals before retrying.",
      },
      503
    );
  }
}
