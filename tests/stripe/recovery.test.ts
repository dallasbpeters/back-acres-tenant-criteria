// biome-ignore-all lint/performance/noAwaitInLoops: Migration and recovery fixture steps must run in sequence.
// biome-ignore-all lint/suspicious/useAwait: Async transport mocks intentionally model rejected or resolved provider promises.
import "./harness";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GET as recover } from "@/app/api/internal/payment-recovery/route";
import {
  authorizationReceipts,
  invoices,
  paymentHistory,
  rentSchedules,
} from "@/lib/db/schema";
import {
  deliverAuthorizationReceipts,
  reconcileRecentPayments,
} from "@/lib/management/payment-recovery";
import {
  client,
  event,
  id,
  invoice,
  pg,
  reset,
  schedule,
  session,
  start,
  state,
} from "./harness";

beforeAll(start);
beforeEach(async () => {
  await reset();
  vi.stubEnv("CRON_SECRET", "isolated-cron-secret");
  vi.stubEnv("RESEND_API_KEY", "isolated-email-credential");
  vi.stubEnv("FROM_EMAIL", "owner@example.invalid");
});
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const consentedAt = new Date("2026-10-18T12:00:00Z");
async function consent() {
  await schedule({
    authorizationText: "I authorize $1,250 monthly for twelve payments.",
    consentedAt,
  });
}
const emailTransport = () =>
  vi.fn(async () => Response.json({ data: [{ id: "email_fixture" }] }));
const job = (authorization = "Bearer isolated-cron-secret") =>
  recover(
    new NextRequest(
      "https://rental.example.invalid/api/internal/payment-recovery",
      { headers: { authorization } }
    )
  );

describe("transactional invoice history", () => {
  it("records financial changes once, preserves partial refund amounts, and rejects edits/deletion", async () => {
    await invoice();
    await state.database
      .update(invoices)
      .set({ paidAt: consentedAt, status: "paid" })
      .where(eq(invoices.id, id));
    await state.database
      .update(invoices)
      .set({ description: "Corrected description" })
      .where(eq(invoices.id, id));
    await state.database
      .update(invoices)
      .set({ refundedCents: 500, status: "partially_refunded" })
      .where(eq(invoices.id, id));
    await state.database
      .update(invoices)
      .set({ refundedCents: 700, status: "partially_refunded" })
      .where(eq(invoices.id, id));
    const rows = await state.database
      .select()
      .from(paymentHistory)
      .orderBy(paymentHistory.observedAt);
    expect(
      rows.map((row: typeof paymentHistory.$inferSelect) => row.status)
    ).toEqual(["open", "paid", "partially_refunded", "partially_refunded"]);
    expect(rows[3]).toMatchObject({
      mode: "test",
      previousStatus: "partially_refunded",
      refundedCents: 700,
    });
    await expect(
      pg.exec("UPDATE payment_history SET amount_cents=1")
    ).rejects.toThrow("append-only");
    await expect(pg.exec("DELETE FROM payment_history")).rejects.toThrow(
      "append-only"
    );
  });
  it("rolls back an invoice change when its history cannot be written", async () => {
    await invoice();
    await pg.exec(
      "ALTER TABLE payment_history ADD CONSTRAINT fixture_history_failure CHECK (status <> 'paid')"
    );
    try {
      await expect(
        state.database
          .update(invoices)
          .set({ status: "paid" })
          .where(eq(invoices.id, id))
      ).rejects.toThrow();
      const [row] = await state.database.select().from(invoices);
      expect(row.status).toBe("open");
    } finally {
      await pg.exec(
        "ALTER TABLE payment_history DROP CONSTRAINT fixture_history_failure"
      );
    }
  });
  it("labels pre-existing invoices as a baseline instead of inventing past activity", async () => {
    const isolated = new PGlite();
    try {
      for (const file of (await readdir("drizzle"))
        .filter((f) => f.endsWith(".sql"))
        .sort()) {
        if (file.startsWith("0013")) {
          await isolated.exec(
            `INSERT INTO properties (id,data,slug) VALUES ('${id}','{}','baseline'); INSERT INTO rental_invoices (id,amount_cents,category,description,due_date,payer_email,payer_name,property_id,status) VALUES ('${id}',100,'rent','Existing','2026-01-01','tenant@example.invalid','Tenant','${id}','paid')`
          );
        }
        await isolated.exec(await readFile(`drizzle/${file}`, "utf8"));
      }
      const result = await isolated.query(
        "SELECT source,status,previous_status FROM payment_history"
      );
      expect(result.rows).toEqual([
        { previous_status: null, source: "migration_baseline", status: "paid" },
      ]);
    } finally {
      await isolated.close();
    }
  });
});

describe("authorization copies and outbox", () => {
  it("queues only accepted terms and preserves the original evidence", async () => {
    await schedule();
    expect(await state.database.select().from(authorizationReceipts)).toEqual(
      []
    );
    await state.database
      .update(rentSchedules)
      .set({ authorizationText: "Accepted terms", consentedAt })
      .where(eq(rentSchedules.id, id));
    await state.database
      .update(rentSchedules)
      .set({ status: "active" })
      .where(eq(rentSchedules.id, id));
    const rows = await state.database.select().from(authorizationReceipts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      authorizationText: "Accepted terms",
      consentedAt,
      recipient: "tenant@example.invalid",
    });
    await expect(
      pg.exec("UPDATE authorization_receipts SET authorization_text='changed'")
    ).rejects.toThrow("cannot be changed");
    await expect(pg.exec("DELETE FROM authorization_receipts")).rejects.toThrow(
      "cannot be deleted"
    );
  });
  it("does not backfill old authorizations when a schedule status changes", async () => {
    await schedule({ authorizationText: null, consentedAt });
    await state.database
      .update(rentSchedules)
      .set({ authorizationText: "Legacy text", status: "active" })
      .where(eq(rentSchedules.id, id));
    expect(await state.database.select().from(authorizationReceipts)).toEqual(
      []
    );
  });
  it("does not contact email services for an empty queue", async () => {
    const transport = emailTransport();
    expect(await deliverAuthorizationReceipts(transport)).toBe(0);
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(["RESEND_API_KEY", "FROM_EMAIL"])(
    "retains evidence when %s is missing",
    async (key) => {
      await consent();
      vi.stubEnv(key, "");
      await expect(deliverAuthorizationReceipts()).rejects.toThrow(
        "not configured"
      );
    }
  );
  it("sends the complete frozen terms with a stable idempotency key and records provider acceptance", async () => {
    await consent();
    const transport = emailTransport();
    expect(await deliverAuthorizationReceipts(transport)).toBe(1);
    const call = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://api.resend.com/emails/batch");
    const [message] = JSON.parse(call[1].body as string);
    expect(message.to).toEqual(["tenant@example.invalid"]);
    expect(message.text).toContain(consentedAt.toISOString());
    expect(message.text).toContain("I authorize $1,250");
    expect(message.text).toContain("does not confirm bank verification");
    const [receipt] = await state.database.select().from(authorizationReceipts);
    expect(receipt.resendId).toBe("email_fixture");
    expect(receipt.acceptedAt).toBeInstanceOf(Date);
    expect(await deliverAuthorizationReceipts(transport)).toBe(0);
  });
  it.each(["rejected", "malformed", "partial", "timeout"])(
    "leaves a receipt pending after %s transport results",
    async (fault) => {
      await consent();
      const transport = vi.fn(async () => {
        if (fault === "timeout") {
          throw new Error("timeout");
        }
        if (fault === "rejected") {
          return new Response("Provider private error", { status: 429 });
        }
        if (fault === "malformed") {
          return new Response("not json");
        }
        return Response.json({ data: [] });
      });
      await expect(deliverAuthorizationReceipts(transport)).rejects.toThrow();
      const [receipt] = await state.database
        .select()
        .from(authorizationReceipts);
      expect(receipt.acceptedAt).toBeNull();
    }
  );
  it("retries a provider-success/database-failure batch with the same key", async () => {
    await consent();
    const transport = emailTransport();
    vi.spyOn(state.database, "batch").mockRejectedValueOnce(
      new Error("database unavailable")
    );
    await expect(deliverAuthorizationReceipts(transport)).rejects.toThrow();
    expect(await deliverAuthorizationReceipts(transport)).toBe(1);
    expect(
      transport.mock.calls.map(
        (call) => (call as unknown as [string, RequestInit])[1].headers
      )
    ).toEqual([expect.anything(), expect.anything()]);
    expect(
      (transport.mock.calls[0] as unknown as [string, RequestInit])[1].headers
    ).toEqual(
      (transport.mock.calls[1] as unknown as [string, RequestInit])[1].headers
    );
  });
});

describe("bounded read-only Stripe recovery", () => {
  it("reconciles supported current-mode events and ignores setup, foreign-mode and unrelated events", async () => {
    client.events.list.mockResolvedValue({
      data: [
        event("invoice.paid", { id: "in_unrelated" }),
        event("setup_intent.succeeded", {}),
        { ...event("invoice.paid", {}), livemode: true },
      ],
      has_more: false,
    });
    expect(await reconcileRecentPayments()).toBe(1);
    expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
    expect(client.checkout.sessions.create).not.toHaveBeenCalled();
    expect(client.events.list).toHaveBeenCalledWith(
      expect.objectContaining({
        created: { gte: expect.any(Number) },
        limit: 100,
      })
    );
  });
  it("recovers a missed Checkout webhook even when the original session save failed", async () => {
    await invoice();
    client.events.list.mockResolvedValue({
      data: [
        event("checkout.session.completed", {
          ...session({ payment_status: "unpaid" }),
          object: "checkout.session",
        }),
      ],
      has_more: false,
    });
    client.checkout.sessions.retrieve.mockResolvedValue(session());
    expect(await reconcileRecentPayments()).toBe(1);
    const [payment] = await state.database.select().from(invoices);
    expect(payment).toMatchObject({
      status: "paid",
      stripeSessionId: "cs_fixture",
    });
    expect(client.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("leaves mismatched or unavailable Checkout records for review", async () => {
    await invoice();
    client.events.list.mockResolvedValue({
      data: [
        event("checkout.session.completed", {
          ...session(),
          object: "checkout.session",
        }),
      ],
      has_more: false,
    });
    client.checkout.sessions.retrieve.mockRejectedValueOnce(
      new Error("Stripe unavailable")
    );
    await expect(reconcileRecentPayments()).rejects.toThrow();
    client.checkout.sessions.retrieve.mockResolvedValue(
      session({ amount_total: 1 })
    );
    await expect(reconcileRecentPayments()).rejects.toThrow(
      "validation failed"
    );
    const [payment] = await state.database.select().from(invoices);
    expect(payment.status).toBe("open");
  });
  it("ignores unknown invoice references from older or unrelated account activity", async () => {
    client.events.list.mockResolvedValue({
      data: [
        event("checkout.session.completed", {
          ...session(),
          object: "checkout.session",
        }),
        event("checkout.session.completed", {
          ...session({ metadata: {} }),
          object: "checkout.session",
        }),
        event("checkout.session.completed", {
          ...session({ metadata: { invoiceId: "invalid" } }),
          object: "checkout.session",
        }),
      ],
      has_more: false,
    });
    expect(await reconcileRecentPayments()).toBe(0);
    expect(client.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });
  it("does not activate a Checkout bank setup during payment recovery", async () => {
    client.events.list.mockResolvedValue({
      data: [
        event("checkout.session.completed", {
          ...session(),
          mode: "setup",
          object: "checkout.session",
        }),
        event("checkout.session.completed", { id: "cs_unrelated" }),
      ],
      has_more: false,
    });
    expect(await reconcileRecentPayments()).toBe(0);
    expect(client.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });
  it("traverses later pages", async () => {
    client.events.list
      .mockResolvedValueOnce({ data: [event("unrelated", {})], has_more: true })
      .mockResolvedValueOnce({ data: [], has_more: false });
    expect(await reconcileRecentPayments()).toBe(0);
    expect(client.events.list.mock.calls[1][0].starting_after).toBe(
      "evt_fixture"
    );
  });
  it.each(["empty", "repeated", "too_many"])(
    "fails visibly for %s paging",
    async (fault) => {
      let counter = 0;
      client.events.list.mockImplementation(async () => {
        counter += 1;
        return {
          data:
            fault === "empty"
              ? []
              : [
                  {
                    ...event("unrelated", {}),
                    id: fault === "repeated" ? "same" : `evt_${counter}`,
                  },
                ],
          has_more: true,
        };
      });
      await expect(reconcileRecentPayments()).rejects.toThrow();
      expect(client.events.list.mock.calls.length).toBeLessThanOrEqual(5);
    }
  );
  it("propagates provider and reconciliation failures for retry", async () => {
    client.events.list.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(reconcileRecentPayments()).rejects.toThrow();
    client.events.list.mockResolvedValue({
      data: [
        event("invoice.paid", {
          id: "in_fixture",
          parent: {
            subscription_details: { metadata: { rentScheduleId: id } },
          },
        }),
      ],
      has_more: false,
    });
    await expect(reconcileRecentPayments()).rejects.toThrow();
  });
  it("uses the live environment only when explicitly enabled", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_isolated_fixture");
    vi.stubEnv("PAYMENTS_LIVE_ENABLED", "true");
    client.events.list.mockResolvedValue({
      data: [{ ...event("invoice.paid", {}), livemode: true }],
      has_more: false,
    });
    expect(await reconcileRecentPayments()).toBe(1);
  });
});

describe("scheduled worker authentication and failures", () => {
  it.each(["", "Bearer wrong", "Bearer isolated-cron-secreé"])(
    "rejects an unauthorized caller %s",
    async (authorization) => {
      expect((await job(authorization)).status).toBe(401);
      expect(client.events.list).not.toHaveBeenCalled();
    }
  );
  it("fails closed without a configured worker secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await job()).status).toBe(401);
  });
  it("delivers accepted terms even when Stripe recovery fails", async () => {
    await consent();
    client.events.list.mockRejectedValue(new Error("Stripe unavailable"));
    vi.stubGlobal("fetch", emailTransport());
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await job()).status).toBe(503);
    const [receipt] = await state.database.select().from(authorizationReceipts);
    expect(receipt.acceptedAt).toBeInstanceOf(Date);
  });
  it("reports a database outage without leaking details or calling Stripe", async () => {
    vi.spyOn(state.database, "insert").mockImplementationOnce(() => {
      throw new Error("private db error");
    });
    vi.spyOn(state.database, "update").mockImplementationOnce(() => {
      throw new Error("private db error");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await job()).status).toBe(503);
    expect(client.events.list).not.toHaveBeenCalled();
  });
  it("reports receipt delivery failure even if Stripe succeeds", async () => {
    await consent();
    client.events.list.mockResolvedValue({ data: [], has_more: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private provider error", { status: 500 }))
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await job()).status).toBe(503);
  });
  it("returns only counts on success", async () => {
    client.events.list.mockResolvedValue({ data: [], has_more: false });
    const response = await job();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      acceptedReceipts: 0,
      reconciled: 0,
    });
  });
  it("returns a generic retryable failure and logs no provider payload", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    client.events.list.mockRejectedValue(new Error("private provider body"));
    const response = await job();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider body");
    expect(log).toHaveBeenCalledWith("payment_recovery_failed");
  });
});
