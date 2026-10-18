// biome-ignore-all lint/suspicious/useAwait: Async transport stubs intentionally preserve native promise and rejection behavior, including faults before the first await.
// biome-ignore-all lint/performance/noAwaitInLoops: These stateful fixtures and assertions must finish each transition before the next request or cleanup.
// Register isolated provider/database mocks before importing any payment route.
import "./harness";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { requireValue } from "@/lib/required";
import { POST as billing } from "../../app/api/admin/billing/route";
import { POST as manage } from "../../app/api/admin/management/route";
import { POST as enroll } from "../../app/api/payments/autopay/route";
import { POST as checkout } from "../../app/api/payments/checkout/route";
import { POST as webhook } from "../../app/api/payments/webhook/route";
import { db } from "../../lib/db";
// biome-ignore lint/performance/noNamespaceImport: Drizzle needs the complete schema object, including relationships, for this server-only database/test adapter.
import * as schema from "../../lib/db/schema";
import {
  activateAutopay,
  authorizationText,
  handleAutopayEvent,
  stopAutopay,
} from "../../lib/management/autopay";
import { handleBillingEvent } from "../../lib/management/billing-events";
import { linkToken, tokenId } from "../../lib/management/security";
import { paymentMode, paymentReady, stripe } from "../../lib/management/stripe";
import {
  bank,
  client,
  event,
  id,
  invoice,
  pg,
  property,
  propertyId,
  readyBank,
  request,
  reset,
  schedule,
  session,
  start,
  state,
  stored,
  webhookRequest,
} from "./harness";

beforeAll(start);
beforeEach(reset);
afterAll(async () => {
  await pg.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const pay = (body: any = { token: linkToken("payment", id) }) =>
  checkout(request("/api/payments/checkout", body));
const ach = (patch = {}) =>
  enroll(
    request("/api/payments/autopay", {
      action: "enroll",
      authorized: true,
      token: linkToken("autopay", id),
      ...patch,
    })
  );
const notify = (type = "checkout.session.completed", patch = {}) =>
  webhook(webhookRequest(event(type, session(patch))));
const billingData = () => ({
  authorized: true,
  collection: "invoice",
  firstDate: "2099-01-10",
  installments: 12,
  monthlyCents: 125_000,
  payerEmail: "tenant@example.invalid",
  payerName: "Tenant",
  propertyId,
});
const create = (data = billingData(), recordId = id) =>
  billing(
    request("/api/admin/billing", { action: "create", data, id: recordId })
  );
const cancel = () =>
  billing(request("/api/admin/billing", { action: "cancel", id }));
describe("configuration, authentication, and private links", () => {
  it.each(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"])(
    "fails closed without %s",
    (key) => {
      vi.stubEnv(key, "");
      expect(paymentReady()).toBe(false);
      expect(() => stripe()).toThrow();
    }
  );
  it.each(["sk_live_fixture", "rk_live_fixture"])(
    "requires explicit live authorization for %s",
    (key) => {
      vi.stubEnv("STRIPE_SECRET_KEY", key);
      expect(paymentMode()).toBe("live");
      expect(paymentReady()).toBe(false);
      vi.stubEnv("PAYMENTS_LIVE_ENABLED", "true");
      expect(paymentReady()).toBe(true);
    }
  );
  it("accepts test keys without enabling live payments", () => {
    expect(paymentMode()).toBe("test");
    expect(paymentReady()).toBe(true);
  });
  it("binds links to their purpose and rejects tampering, truncation, and extra segments", () => {
    const token = linkToken("payment", id);
    expect(tokenId("payment", token)).toBe(id);
    for (const bad of [
      `${token}x`,
      `${token}.extra`,
      token.slice(0, -1),
      token.replace(id, propertyId),
      "",
      "x",
    ]) {
      expect(tokenId("payment", bad)).toBeNull();
    }
    expect(tokenId("autopay", token)).toBeNull();
  });
  it.each([checkout, enroll, billing])(
    "rejects cross-origin mutations before Stripe or DB calls",
    async (route) => {
      const r = await route(
        request("/api/test", {}, { origin: "https://evil.invalid" })
      );
      expect(r.status).toBe(403);
      expect(client.customers.create).not.toHaveBeenCalled();
    }
  );
  it("requires an allowed owner for billing", async () => {
    for (const s of [null, { user: { email: "outsider@example.invalid" } }]) {
      state.session = s;
      expect((await create()).status).toBe(401);
    }
  });
  it.each([checkout, enroll, billing])(
    "fails closed when payments are unavailable",
    async (route) => {
      vi.stubEnv("STRIPE_SECRET_KEY", "");
      expect((await route(request("/api/test", {}))).status).toBe(503);
    }
  );
  it.each([checkout, enroll, billing])(
    "rejects malformed, oversized and non-JSON input",
    async (route) => {
      for (const [body, headers] of [
        ["{", {}],
        ["x".repeat(65_000), {}],
        ["{}", { "content-type": "text/plain" }],
      ] as const) {
        expect((await route(request("/api/test", body, headers))).status).toBe(
          400
        );
      }
    }
  );
});
describe("one-time checkout", () => {
  it("creates exact cents, USD, trusted return URLs and a stable idempotency key; reuses the session", async () => {
    await invoice();
    expect((await pay()).status).toBe(200);
    expect(client.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: id,
        customer_email: "tenant@example.invalid",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: "Rent" },
              unit_amount: 125_000,
            },
            quantity: 1,
          },
        ],
        metadata: { invoiceId: id },
        mode: "payment",
        success_url: expect.stringContaining(
          "https://rental.example.invalid/pay/"
        ),
      }),
      { idempotencyKey: `rental-invoice-${id}` }
    );
    expect((await stored()).stripeSessionId).toBe("cs_fixture");
    expect((await pay()).status).toBe(200);
    expect(client.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["void", 410],
    ["paid", 409],
  ])("blocks %s requests", async (status, code) => {
    await invoice({ status });
    expect((await pay()).status).toBe(code);
    expect(client.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("rejects missing, removed, wrong-mode and invalid links", async () => {
    expect((await pay()).status).toBe(404);
    await invoice({ mode: "live" });
    expect((await pay()).status).toBe(409);
    await state.database.update(schema.invoices).set({ mode: "test" });
    await state.database.insert(schema.removedRecords).values({
      actor: "fixture",
      entityId: id,
      groupId: id,
      kind: "invoice",
      label: "Fixture",
    });
    expect((await pay()).status).toBe(404);
    expect((await pay({ token: "bad" })).status).toBe(404);
  });
  it("uses hosted invoices without creating a second checkout", async () => {
    await invoice({ stripeInvoiceId: "in_fixture" });
    expect((await pay()).status).toBe(409);
    await state.database
      .update(schema.invoices)
      .set({ hostedInvoiceUrl: "https://invoice.stripe.com/fixture" });
    expect(await (await pay()).json()).toEqual({
      url: "https://invoice.stripe.com/fixture",
    });
    expect(client.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it.each(["complete", "expired"])(
    "does not replace a %s checkout",
    async (status) => {
      await invoice({ stripeSessionId: "cs_fixture" });
      client.checkout.sessions.retrieve.mockResolvedValue({ status });
      expect((await pay()).status).toBe(409);
      expect(client.checkout.sessions.create).not.toHaveBeenCalled();
    }
  );
  it("rejects a provider session with no redirect URL", async () => {
    await invoice();
    client.checkout.sessions.create.mockResolvedValue({
      id: "cs_fixture",
      status: "open",
      url: null,
    });
    expect((await pay()).status).toBe(409);
  });
  it("admits only one concurrent checkout creation", async () => {
    await invoice();
    const results = await Promise.all([pay(), pay()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(client.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
  it("rate limits repeated attempts without preventing webhook settlement", async () => {
    await invoice({ stripeSessionId: "cs_fixture" });
    for (let n = 0; n < 8; n += 1) {
      expect((await pay()).status).toBe(200);
    }
    expect((await pay()).status).toBe(429);
    expect((await notify()).status).toBe(200);
    expect((await stored()).status).toBe("paid");
  });
  it("keeps ambiguous provider failures locked against a duplicate charge", async () => {
    await invoice();
    client.checkout.sessions.create.mockRejectedValue(
      new Error("timeout secret detail")
    );
    const r = await pay();
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("secret detail");
    expect((await stored()).status).toBe("creating_checkout");
    expect((await pay()).status).toBe(409);
    expect(client.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
  it("survives database failure after Stripe accepts checkout; webhook recovers it", async () => {
    await invoice();
    client.checkout.sessions.create.mockImplementation(async () => {
      vi.spyOn(state.database, "update").mockImplementationOnce(() => {
        throw new Error("DB unavailable");
      });
      return {
        id: "cs_fixture",
        status: "open",
        url: "https://checkout.stripe.com/fixture",
      };
    });
    expect((await pay()).status).toBe(503);
    expect((await stored()).status).toBe("creating_checkout");
    expect((await notify()).status).toBe(200);
    expect((await stored()).status).toBe("paid");
  });
  it("returns a retryable response for database and session-retrieval outages", async () => {
    vi.mocked(db).mockImplementationOnce(() => {
      throw new Error("offline");
    });
    expect((await pay()).status).toBe(503);
    await invoice({ stripeSessionId: "cs_fixture" });
    client.checkout.sessions.retrieve.mockRejectedValue(new Error("offline"));
    expect((await pay()).status).toBe(503);
  });
});
describe("signed checkout webhooks", () => {
  it.each(["missing", "wrong secret", "expired", "tampered"])(
    "rejects %s signatures without mutating payments",
    async (kind) => {
      await invoice();
      const e = event("checkout.session.completed", session());
      let req = webhookRequest(
        e,
        kind === "wrong secret" ? "wrong" : "whsec_isolated_fixture",
        kind === "expired" ? 1 : undefined
      );
      if (kind === "missing") {
        req.headers.delete("stripe-signature");
      }
      if (kind === "tampered") {
        req = request("/api/payments/webhook", "{}", {
          "stripe-signature": requireValue(
            req.headers.get("stripe-signature"),
            "Expected req.headers.get(stripe-signature)"
          ),
        });
      }
      expect((await webhook(req)).status).toBe(400);
      expect((await stored()).status).toBe("open");
    }
  );
  it("acknowledges unknown events and unrelated checkout without database writes", async () => {
    expect(
      (await webhook(webhookRequest(event("customer.created", {})))).status
    ).toBe(200);
    expect(
      (await notify("checkout.session.completed", { metadata: {} })).status
    ).toBe(200);
  });
  it.each([
    { livemode: true },
    { client_reference_id: propertyId },
    { amount_total: 1 },
    { currency: "eur" },
    { id: "cs_other" },
  ])("rejects mismatched invoice/session identity %j", async (patch) => {
    await invoice({ stripeSessionId: "cs_fixture" });
    expect((await notify("checkout.session.completed", patch)).status).toBe(
      400
    );
    expect((await stored()).status).toBe("open");
  });
  it("rejects a nonexistent invoice", async () => {
    expect((await notify()).status).toBe(400);
  });
  it("records unpaid ACH as processing, then failed, then successful settlement; never downgrades paid", async () => {
    await invoice();
    expect(
      (await notify("checkout.session.completed", { payment_status: "unpaid" }))
        .status
    ).toBe(200);
    expect((await stored()).status).toBe("processing");
    await notify("checkout.session.async_payment_failed", {
      payment_status: "unpaid",
    });
    expect((await stored()).status).toBe("failed");
    await notify("checkout.session.async_payment_succeeded");
    const paid = await stored();
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).toBeInstanceOf(Date);
    await notify("checkout.session.async_payment_failed", {
      payment_status: "unpaid",
    });
    await notify();
    expect((await stored()).paidAt).toEqual(paid.paidAt);
    expect((await stored()).status).toBe("paid");
  });
  it("does not downgrade a failed bank payment when completed arrives late", async () => {
    await invoice();
    await notify("checkout.session.async_payment_failed", {
      payment_status: "unpaid",
    });
    await notify("checkout.session.completed", { payment_status: "unpaid" });
    expect((await stored()).status).toBe("failed");
  });
  it("returns 503 on persistence failure so Stripe retries", async () => {
    await invoice();
    vi.spyOn(state.database, "update").mockImplementationOnce(() => {
      throw new Error("offline");
    });
    expect((await notify()).status).toBe(503);
    expect((await notify()).status).toBe(200);
    expect((await stored()).status).toBe("paid");
  });
});
describe("ACH enrollment and revocation", () => {
  it("requires explicit tenant consent without creating Stripe resources", async () => {
    await schedule();
    expect((await ach({ authorized: false })).status).toBe(400);
    expect(client.customers.create).not.toHaveBeenCalled();
    expect((await stored(schema.rentSchedules)).consentedAt).toBeNull();
  });
  it.each([
    { status: "active" },
    { status: "canceled" },
    { firstDate: "2000-01-10" },
  ])("blocks closed or expired enrollments %j", async (patch) => {
    await schedule(patch);
    expect((await ach()).status).toBe(409);
  });
  it.each([{ mode: "live" }, { collection: "invoice" }])(
    "rejects wrong-mode or non-ACH schedules %j",
    async (patch) => {
      await schedule(patch);
      expect((await ach()).status).toBe(404);
    }
  );
  it("creates ACH-only setup checkout with durable authorization and stable keys", async () => {
    const r = await schedule();
    expect((await ach()).status).toBe(200);
    const saved = await stored(schema.rentSchedules);
    expect(saved.status).toBe("awaiting_verification");
    expect(saved.consentedAt).toBeInstanceOf(Date);
    expect(saved.authorizationText).toBe(authorizationText(r as any));
    expect(client.customers.create.mock.calls[0][1]).toEqual({
      idempotencyKey: `ach-customer-${id}`,
    });
    expect(client.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_payment_method_types: ["us_bank_account"],
        customer: "cus_fixture",
        mode: "setup",
        setup_intent_data: { metadata: { rentScheduleId: id } },
      }),
      { idempotencyKey: `ach-setup-${id}` }
    );
    expect((await ach()).status).toBe(200);
    expect(client.customers.create).toHaveBeenCalledTimes(1);
  });
  it("blocks duplicate concurrent enrollment", async () => {
    await schedule();
    const results = await Promise.all([ach(), ach()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(client.customers.create).toHaveBeenCalledTimes(1);
  });
  it.each(["customers.create", "checkout.sessions.create"])(
    "fails safely at %s and prevents blind retries",
    async (name) => {
      await schedule();
      const fn =
        name === "customers.create"
          ? client.customers.create
          : client.checkout.sessions.create;
      fn.mockRejectedValue(new Error("timeout"));
      expect((await ach()).status).toBe(503);
      expect((await ach()).status).toBe(409);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  );
  it("expires checkout if stop wins the race before checkout is saved", async () => {
    await schedule();
    client.checkout.sessions.create.mockImplementation(async () => {
      await state.database
        .update(schema.rentSchedules)
        .set({ status: "canceled" });
      return { id: "cs_fixture", status: "open" };
    });
    expect((await ach()).status).toBe(409);
    expect(client.checkout.sessions.expire).toHaveBeenCalledWith("cs_fixture");
    expect((await stored(schema.rentSchedules)).status).toBe("canceled");
  });
  it("allows revocation after exhausting enrollment rate limits", async () => {
    await schedule({
      setupSessionId: "cs_fixture",
      status: "awaiting_verification",
    });
    for (let n = 0; n < 8; n += 1) {
      await ach();
    }
    expect((await ach()).status).toBe(429);
    expect((await ach({ action: "stop" })).status).toBe(200);
    expect((await stored(schema.rentSchedules)).status).toBe("canceled");
  });
  it("cancels provider schedule, expires open checkout and cancels incomplete setup intent", async () => {
    await readyBank({
      status: "active",
      stripeScheduleId: "sub_sched_fixture",
    });
    client.subscriptionSchedules.retrieve.mockResolvedValue({
      id: "sub_sched_fixture",
      status: "active",
    });
    client.checkout.sessions.retrieve.mockResolvedValue({
      id: "cs_fixture",
      setup_intent: "seti_fixture",
      status: "open",
    });
    client.setupIntents.retrieve.mockResolvedValue({
      id: "seti_fixture",
      status: "requires_action",
    });
    await stopAutopay(id);
    expect(client.subscriptionSchedules.cancel).toHaveBeenCalledWith(
      "sub_sched_fixture",
      { invoice_now: false, prorate: false }
    );
    expect(client.setupIntents.cancel).toHaveBeenCalledWith("seti_fixture");
    expect((await stored(schema.rentSchedules)).status).toBe("canceled");
    await stopAutopay(id);
    expect(client.subscriptionSchedules.cancel).toHaveBeenCalledTimes(1);
  });
  it("recovers an orphan provider schedule by customer metadata before canceling", async () => {
    await readyBank();
    client.subscriptionSchedules.list.mockResolvedValue({
      data: [
        { id: "orphan", metadata: { rentScheduleId: id }, status: "active" },
        { id: "unrelated", metadata: {}, status: "active" },
      ],
      has_more: false,
    });
    await stopAutopay(id);
    expect(client.subscriptionSchedules.cancel).toHaveBeenCalledTimes(1);
    expect(client.subscriptionSchedules.cancel.mock.calls[0][0]).toBe("orphan");
  });
  it.each(["schedule", "checkout", "intent"])(
    "preserves canceling state and permits retry after %s failure",
    async (at) => {
      await readyBank({ stripeScheduleId: "sub_sched_fixture" });
      client.subscriptionSchedules.retrieve.mockResolvedValue({
        id: "sub_sched_fixture",
        status: "active",
      });
      client.checkout.sessions.retrieve.mockResolvedValue({
        id: "cs_fixture",
        setup_intent: "seti_fixture",
        status: "open",
      });
      client.setupIntents.retrieve.mockResolvedValue({
        id: "seti_fixture",
        status: "requires_action",
      });
      const resolveFn1 = () => {
        if (at === "schedule") {
          return client.subscriptionSchedules.cancel;
        }
        if (at === "checkout") {
          return client.checkout.sessions.expire;
        }
        return client.setupIntents.cancel;
      };
      const fn = resolveFn1();
      fn.mockRejectedValueOnce(new Error("timeout"));
      await expect(stopAutopay(id)).rejects.toThrow();
      expect((await stored(schema.rentSchedules)).status).toBe("canceling");
      await stopAutopay(id);
      expect((await stored(schema.rentSchedules)).status).toBe("canceled");
    }
  );
});
describe("verified mandate activation", () => {
  it("creates a finite fixed-rent bank schedule only after mandate verification", async () => {
    await readyBank();
    bank();
    await activateAutopay("seti_fixture");
    expect((await stored(schema.rentSchedules)).status).toBe("not_started");
    expect(client.subscriptionSchedules.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_fixture",
        default_settings: {
          collection_method: "charge_automatically",
          default_payment_method: "pm_fixture",
        },
        end_behavior: "cancel",
        phases: [
          expect.objectContaining({
            duration: { interval: "month", interval_count: 12 },
            items: [
              {
                price_data: {
                  currency: "usd",
                  product: "prod_fixture",
                  recurring: { interval: "month" },
                  unit_amount: 125_000,
                },
                quantity: 1,
              },
            ],
          }),
        ],
      }),
      { idempotencyKey: `ach-schedule-${id}` }
    );
    await activateAutopay("seti_fixture");
    expect(client.subscriptionSchedules.create).toHaveBeenCalledTimes(1);
  });
  it.each([{ customer: "cus_other" }, { livemode: true }, { metadata: {} }])(
    "ignores an unrelated setup intent %j",
    async (patch) => {
      await readyBank();
      bank(patch);
      await activateAutopay("seti_fixture");
      expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
    }
  );
  it.each([
    { consentedAt: null },
    { setupSessionId: null },
    { collection: "invoice" },
    { mode: "live" },
    { status: "canceled" },
    { status: "canceling" },
    { status: "completed" },
    { stripeScheduleId: "already_saved" },
  ])("does not activate an ineligible enrollment %j", async (patch) => {
    await readyBank(patch);
    bank();
    await activateAutopay("seti_fixture");
    expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
  });
  it.each([{ setup_intent: "different" }, { client_reference_id: propertyId }])(
    "rejects mismatched checkout identity %j",
    async (patch) => {
      await readyBank();
      bank();
      client.checkout.sessions.retrieve.mockResolvedValue({
        client_reference_id: id,
        setup_intent: "seti_fixture",
        ...patch,
      });
      await activateAutopay("seti_fixture");
      expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
    }
  );
  it.each(["requires_action", "processing", "canceled"])(
    "records %s verification without activating",
    async (status) => {
      await readyBank();
      bank({ status });
      await activateAutopay("seti_fixture");
      expect((await stored(schema.rentSchedules)).status).toBe(
        status === "canceled" ? "needs_review" : "awaiting_verification"
      );
      expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
    }
  );
  it.each([
    "missing method",
    "missing mandate",
    "inactive mandate",
    "card",
    "wrong customer",
  ])("refuses %s", async (kind) => {
    await readyBank();
    const resolveResult2 = () => {
      if (kind === "missing method") {
        return { payment_method: null };
      }
      if (kind === "missing mandate") {
        return { mandate: null };
      }
      return {};
    };
    bank(resolveResult2());
    if (kind === "inactive mandate") {
      client.mandates.retrieve.mockResolvedValue({ status: "inactive" });
    }
    if (kind === "card" || kind === "wrong customer") {
      client.paymentMethods.retrieve.mockResolvedValue({
        customer: kind === "wrong customer" ? "other" : "cus_fixture",
        type: kind === "card" ? "card" : "us_bank_account",
      });
    }
    await expect(activateAutopay("seti_fixture")).rejects.toThrow();
    expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
  });
  it("moves missed starts to review instead of initiating a past-due debit", async () => {
    await readyBank({ firstDate: "2000-01-10" });
    bank();
    await activateAutopay("seti_fixture");
    expect((await stored(schema.rentSchedules)).status).toBe("needs_review");
    expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
  });
  it("recovers a provider schedule after a lost response without creating another", async () => {
    await readyBank();
    bank();
    client.subscriptionSchedules.list.mockResolvedValue({
      data: [
        { id: "recovered", metadata: { rentScheduleId: id }, status: "active" },
      ],
    });
    await activateAutopay("seti_fixture");
    expect((await stored(schema.rentSchedules)).stripeScheduleId).toBe(
      "recovered"
    );
    expect(client.products.create).not.toHaveBeenCalled();
    expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
  });
  it.each([
    "intent",
    "session",
    "mandate",
    "method",
    "list",
    "product",
    "schedule",
  ])(
    "returns retryable webhook failure at the %s connection and recovers",
    async (at) => {
      await readyBank();
      bank();
      const fn = requireValue(
        {
          intent: client.setupIntents.retrieve,
          list: client.subscriptionSchedules.list,
          mandate: client.mandates.retrieve,
          method: client.paymentMethods.retrieve,
          product: client.products.create,
          schedule: client.subscriptionSchedules.create,
          session: client.checkout.sessions.retrieve,
        }[at],
        "Expected {         intent: client.setupIntents.retrieve,         list: client.s"
      );
      fn.mockRejectedValueOnce(new Error("network"));
      const req = () =>
        webhook(
          webhookRequest(
            event("setup_intent.succeeded", {
              id: "seti_fixture",
              metadata: { rentScheduleId: id },
            })
          )
        );
      expect((await req()).status).toBe(503);
      expect((await req()).status).toBe(200);
      expect((await stored(schema.rentSchedules)).status).toBe("not_started");
    }
  );
  it("handles checkout setup completion and mandate revocation webhooks", async () => {
    await readyBank();
    bank();
    expect(
      (
        await webhook(
          webhookRequest(
            event("checkout.session.completed", {
              id: "cs_fixture",
              metadata: { rentScheduleId: id },
              mode: "setup",
            })
          )
        )
      ).status
    ).toBe(200);
    client.mandates.retrieve.mockResolvedValue({
      livemode: false,
      payment_method: "pm_fixture",
      status: "inactive",
    });
    client.subscriptionSchedules.retrieve.mockResolvedValue({
      id: "sub_sched_fixture",
      status: "active",
    });
    expect(
      (
        await webhook(
          webhookRequest(event("mandate.updated", { id: "mandate_fixture" }))
        )
      ).status
    ).toBe(200);
    expect((await stored(schema.rentSchedules)).status).toBe("canceled");
  });
});
describe("owner billing schedules", () => {
  it("creates monthly manual invoices with bounded installments and no automatic debit", async () => {
    await property();
    expect((await create()).status).toBe(200);
    expect(client.subscriptionSchedules.create).toHaveBeenCalledWith(
      expect.objectContaining({
        default_settings: {
          collection_method: "send_invoice",
          invoice_settings: { days_until_due: 0 },
        },
        end_behavior: "cancel",
        phases: [
          expect.objectContaining({
            duration: { interval: "month", interval_count: 12 },
          }),
        ],
      }),
      { idempotencyKey: `rent-schedule-${id}` }
    );
    expect((await stored(schema.rentSchedules)).stripeCustomerId).toBe(
      "cus_fixture"
    );
    expect((await create()).status).toBe(200);
    expect(client.subscriptionSchedules.create).toHaveBeenCalledTimes(1);
  });
  it("creates an ACH invitation without charging or creating a customer", async () => {
    await property();
    expect((await create({ ...billingData(), collection: "ach" })).status).toBe(
      200
    );
    expect((await stored(schema.rentSchedules)).status).toBe(
      "awaiting_authorization"
    );
    expect(client.customers.create).not.toHaveBeenCalled();
  });
  it.each([
    { authorized: false },
    { installments: 0 },
    { installments: 61 },
    { monthlyCents: 1 },
    { monthlyCents: 125.5 },
    { payerEmail: "bad" },
    { firstDate: "2099-02-30" },
    { firstDate: "2099-01-29" },
    { firstDate: "2000-01-01" },
  ])("rejects invalid billing terms %j", async (patch) => {
    await property();
    expect((await create({ ...billingData(), ...patch } as any)).status).toBe(
      400
    );
    expect(client.customers.create).not.toHaveBeenCalled();
  });
  it("rejects missing property and duplicate payer/property schedules", async () => {
    expect((await create()).status).toBe(404);
    await schedule();
    expect((await create(billingData(), crypto.randomUUID())).status).toBe(409);
    expect(client.customers.create).not.toHaveBeenCalled();
  });
  it("blocks wrong-mode existing schedules", async () => {
    await schedule({ mode: "live" });
    expect((await create()).status).toBe(409);
    expect((await cancel()).status).toBe(409);
  });
  it.each(["customer", "product", "schedule"])(
    "marks ambiguous %s creation failures for review and blocks a duplicate",
    async (at) => {
      await property();
      const fn = requireValue(
        {
          customer: client.customers.create,
          product: client.products.create,
          schedule: client.subscriptionSchedules.create,
        }[at],
        "Expected {         customer: client.customers.create,         product: client.p"
      );
      fn.mockRejectedValueOnce(new Error("timeout"));
      expect((await create()).status).toBe(503);
      expect((await stored(schema.rentSchedules)).status).toBe("needs_review");
      expect((await create()).status).toBe(409);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  );
  it("keeps provider success/local-save failure in review", async () => {
    await property();
    client.subscriptionSchedules.create.mockImplementation(async () => {
      vi.spyOn(state.database, "update").mockImplementationOnce(() => {
        throw new Error("DB down");
      });
      return { id: "sub_sched_fixture", status: "active" };
    });
    expect((await create()).status).toBe(503);
    expect((await stored(schema.rentSchedules)).status).toBe("needs_review");
  });
  it("cancels manual billing without prorations or immediate invoices", async () => {
    await schedule({
      collection: "invoice",
      status: "active",
      stripeScheduleId: "sub_sched_fixture",
    });
    expect((await cancel()).status).toBe(200);
    expect(client.subscriptionSchedules.cancel).toHaveBeenCalledWith(
      "sub_sched_fixture",
      { invoice_now: false, prorate: false }
    );
    expect((await cancel()).status).toBe(200);
    expect(client.subscriptionSchedules.cancel).toHaveBeenCalledTimes(1);
  });
  it("does not claim cancellation when Stripe fails or schedule identity is missing", async () => {
    await schedule({ collection: "invoice", status: "active" });
    expect((await cancel()).status).toBe(409);
    await state.database
      .update(schema.rentSchedules)
      .set({ stripeScheduleId: "sub_sched_fixture" });
    client.subscriptionSchedules.cancel.mockRejectedValueOnce(
      new Error("timeout")
    );
    expect((await cancel()).status).toBe(503);
    expect((await stored(schema.rentSchedules)).status).toBe("active");
  });
});
const providerInvoice = (patch = {}) => ({
  amount_due: 125_000,
  created: 1_900_000_000,
  currency: "usd",
  customer: "cus_fixture",
  due_date: 1_900_086_400,
  hosted_invoice_url: "https://invoice.stripe.com/fixture",
  id: "in_fixture",
  lines: { data: [{ description: "Monthly rent" }] },
  livemode: false,
  parent: { subscription_details: { metadata: { rentScheduleId: id } } },
  status: "open",
  status_transitions: { paid_at: null },
  ...patch,
});
function invoicePayment(status: string, charge: any = null) {
  client.invoicePayments.list.mockResolvedValue({
    data: [
      {
        invoice: "in_fixture",
        payment: {
          payment_intent: {
            created: 1_900_000_000,
            id: "pi_fixture",
            last_payment_error:
              status === "requires_payment_method"
                ? { message: "Bank failed" }
                : null,
            latest_charge: charge ? "ch_fixture" : null,
            status,
          },
        },
      },
    ],
  });
  if (charge) {
    client.charges.retrieve.mockResolvedValue(charge);
  }
}
async function reconcile(patch = {}) {
  const i = providerInvoice(patch);
  client.invoices.retrieve.mockResolvedValue(i);
  await handleBillingEvent(event("invoice.paid", i));
}
describe("recurring invoice reconciliation, bank returns, refunds and disputes", () => {
  it.each([
    ["open", "requires_action", "open", null],
    ["open", "processing", "processing", null],
    ["paid", "succeeded", "paid", null],
    ["void", "requires_action", "void", null],
    ["uncollectible", "requires_action", "uncollectible", null],
    ["open", "requires_payment_method", "failed", null],
    ["paid", "succeeded", "failed", { status: "failed" }],
    ["paid", "succeeded", "partially_refunded", { amount_refunded: 500 }],
    ["paid", "succeeded", "refunded", { refunded: true }],
    ["paid", "succeeded", "disputed", { disputed: true }],
  ])(
    "maps invoice %s / intent %s to %s",
    async (status, intent, expected, charge) => {
      await readyBank();
      invoicePayment(intent, charge);
      await reconcile({ status });
      const r = await stored();
      expect(r.status).toBe(expected);
      expect(r.amountCents).toBe(125_000);
      expect(r.billingScheduleId).toBe(id);
      expect(r.stripeInvoiceId).toBe("in_fixture");
      expect(r.dueDate).toBe("2030-03-18");
    }
  );
  it.each([
    { customer: "different" },
    { currency: "eur" },
    { livemode: true },
    { parent: null },
  ])("ignores unrelated provider invoices %j", async (patch) => {
    await readyBank();
    await reconcile(patch);
    expect(await stored()).toBeUndefined();
  });
  it("fetches current provider status rather than trusting a stale event snapshot", async () => {
    await readyBank();
    client.invoices.retrieve.mockResolvedValue(
      providerInvoice({ status: "paid" })
    );
    await handleBillingEvent(
      event("invoice.payment_failed", providerInvoice())
    );
    expect((await stored()).status).toBe("paid");
  });
  it.each([
    "paid",
    "partially_refunded",
    "refunded",
    "disputed",
    "void",
    "uncollectible",
  ])(
    "preserves %s through duplicate and out-of-order reconciliation",
    async (final) => {
      await readyBank();
      const patch = {
        status:
          final === "paid" ||
          ["partially_refunded", "refunded", "disputed"].includes(final)
            ? "paid"
            : final,
      };
      const resolveResult3 = () => {
        if (final === "partially_refunded") {
          return { amount_refunded: 500 };
        }
        if (final === "refunded") {
          return { refunded: true };
        }
        if (final === "disputed") {
          return { disputed: true };
        }
        return null;
      };
      invoicePayment("succeeded", resolveResult3());
      await reconcile(patch);
      const previous = await stored();
      invoicePayment("processing");
      await reconcile();
      await reconcile();
      expect((await stored()).status).toBe(final);
      expect((await stored()).paidAt).toEqual(previous.paidAt);
      expect(await state.database.select().from(schema.invoices)).toHaveLength(
        1
      );
    }
  );
  it("uses the most recent payment attempt and follows expanded or string charges", async () => {
    await readyBank();
    client.invoicePayments.list.mockResolvedValue({
      data: [
        {
          payment: {
            payment_intent: {
              created: 1,
              id: "old",
              last_payment_error: {},
              status: "requires_payment_method",
            },
          },
        },
        {
          payment: {
            payment_intent: {
              created: 2,
              id: "new",
              latest_charge: { refunded: true },
              status: "succeeded",
            },
          },
        },
      ],
    });
    await reconcile({ status: "paid" });
    expect((await stored()).status).toBe("refunded");
    expect(client.charges.retrieve).not.toHaveBeenCalled();
  });
  it.each([
    "payment_intent.processing",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "charge.failed",
    "charge.dispute.created",
    "charge.dispute.closed",
    "charge.refunded",
  ])("routes %s through current recurring invoice", async (type) => {
    await readyBank();
    client.invoicePayments.list
      .mockResolvedValueOnce({ data: [{ invoice: "in_fixture" }] })
      .mockResolvedValue({ data: [] });
    client.invoices.retrieve.mockResolvedValue(
      providerInvoice({ status: "paid" })
    );
    await handleBillingEvent(
      event(type, {
        id: type.startsWith("payment_intent.") ? "pi_fixture" : "ch_fixture",
        payment_intent: { id: "pi_fixture" },
      })
    );
    expect(client.invoicePayments.list.mock.calls[0][0]).toEqual({
      limit: 100,
      payment: { payment_intent: "pi_fixture", type: "payment_intent" },
    });
    expect((await stored()).status).toBe("paid");
  });
  it.each(["invoice", "payments", "charge", "database"])(
    "returns 503 for %s reconciliation failure, then succeeds on retry",
    async (at) => {
      await readyBank();
      client.invoices.retrieve.mockResolvedValue(
        providerInvoice({ status: "paid" })
      );
      invoicePayment("succeeded", { status: "succeeded" });
      if (at === "invoice") {
        client.invoices.retrieve.mockRejectedValueOnce(new Error("offline"));
      }
      if (at === "payments") {
        client.invoicePayments.list.mockRejectedValueOnce(new Error("offline"));
      }
      if (at === "charge") {
        client.charges.retrieve.mockRejectedValueOnce(new Error("offline"));
      }
      if (at === "database") {
        vi.spyOn(state.database, "insert").mockImplementationOnce(() => {
          throw new Error("offline");
        });
      }
      const send = () =>
        webhook(webhookRequest(event("invoice.paid", providerInvoice())));
      expect((await send()).status).toBe(503);
      expect((await send()).status).toBe(200);
      expect((await stored()).status).toBe("paid");
    }
  );
  it.each(["canceled", "canceling", "completed", "released"])(
    "does not reopen a terminal %s schedule with a delayed active event",
    async (status) => {
      await readyBank({ status });
      client.subscriptionSchedules.retrieve.mockResolvedValue({
        id: "sub_sched_fixture",
        livemode: false,
        metadata: { rentScheduleId: id },
        status: "active",
      });
      await handleBillingEvent(
        event("subscription_schedule.updated", {
          id: "sub_sched_fixture",
          metadata: { rentScheduleId: id },
        })
      );
      expect((await stored(schema.rentSchedules)).status).toBe(status);
    }
  );
  it.each(["active", "canceled", "completed", "released"])(
    "records current schedule status %s",
    async (status) => {
      await readyBank();
      client.subscriptionSchedules.retrieve.mockResolvedValue({
        id: "sub_sched_fixture",
        livemode: false,
        metadata: { rentScheduleId: id },
        status,
      });
      await handleBillingEvent(
        event("subscription_schedule.updated", {
          id: "sub_sched_fixture",
          metadata: { rentScheduleId: id },
        })
      );
      expect((await stored(schema.rentSchedules)).status).toBe(status);
    }
  );
  it("does not mutate a schedule from the wrong environment", async () => {
    await readyBank();
    client.subscriptionSchedules.retrieve.mockResolvedValue({
      id: "sub_sched_fixture",
      livemode: true,
      metadata: { rentScheduleId: id },
      status: "active",
    });
    await handleBillingEvent(
      event("subscription_schedule.updated", {
        id: "sub_sched_fixture",
        metadata: { rentScheduleId: id },
      })
    );
    expect((await stored(schema.rentSchedules)).status).toBe(
      "awaiting_verification"
    );
  });
  it("returns a retryable failure for schedule retrieval outages", async () => {
    await readyBank();
    expect(
      (
        await webhook(
          webhookRequest(
            event("subscription_schedule.updated", {
              id: "sub_sched_fixture",
              metadata: { rentScheduleId: id },
            })
          )
        )
      ).status
    ).toBe(503);
  });
});
describe("one-time bank returns, refunds, and disputes", () => {
  async function setup(patch = {}) {
    await invoice({ status: "paid", stripeSessionId: "cs_fixture", ...patch });
    client.checkout.sessions.list.mockResolvedValue({ data: [session()] });
  }
  function intent(status = "succeeded", charge: any = { status: "succeeded" }) {
    client.paymentIntents.retrieve.mockResolvedValue({
      amount: 125_000,
      currency: "usd",
      id: "pi_fixture",
      last_payment_error:
        status === "requires_payment_method" ? { message: "failed" } : null,
      latest_charge: charge,
      livemode: false,
      status,
    });
  }
  const send = () =>
    webhook(
      webhookRequest(
        event("charge.refunded", {
          id: "ch_fixture",
          payment_intent: "pi_fixture",
        })
      )
    );
  it.each([
    ["refunded", { refunded: true }],
    ["partially_refunded", { amount_refunded: 500 }],
    ["disputed", { disputed: true }],
    ["failed", { status: "failed" }],
  ])("updates a settled checkout to %s", async (expected, charge) => {
    await setup();
    intent("succeeded", charge);
    expect((await send()).status).toBe(200);
    expect((await stored()).status).toBe(expected);
    if (expected !== "failed") {
      await notify();
      expect((await stored()).status).toBe(expected);
    }
  });
  it.each(["processing", "paid", "failed"])(
    "reconciles an unpaid checkout to %s from current intent",
    async (status) => {
      await setup({ status: "open" });
      const resolveResult4 = () => {
        if (status === "paid") {
          return "succeeded";
        }
        if (status === "failed") {
          return "requires_payment_method";
        }
        return "processing";
      };
      intent(resolveResult4(), null);
      expect((await send()).status).toBe(200);
      expect((await stored()).status).toBe(status);
    }
  );
  it("retrieves an unexpanded charge and preserves terminal states through stale reconciliations", async () => {
    await setup();
    intent("succeeded", "ch_fixture");
    client.charges.retrieve.mockResolvedValue({ refunded: true });
    await send();
    intent("succeeded");
    await send();
    expect((await stored()).status).toBe("refunded");
  });
  it.each([
    { livemode: true },
    { amount_total: 1 },
    { currency: "eur" },
    { client_reference_id: propertyId },
    { id: "cs_other" },
    { metadata: {} },
    { metadata: { invoiceId: "bad" } },
  ])("ignores checkout mismatch %j", async (patch) => {
    await setup();
    client.checkout.sessions.list.mockResolvedValue({ data: [session(patch)] });
    intent("succeeded", { refunded: true });
    await send();
    expect((await stored()).status).toBe("paid");
    expect(client.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
  it.each([{ livemode: true }, { amount: 1 }, { currency: "eur" }])(
    "ignores current intent mismatch %j",
    async (patch) => {
      await setup();
      intent();
      client.paymentIntents.retrieve.mockResolvedValue({
        ...(await client.paymentIntents.retrieve()),
        ...patch,
      });
      await send();
      expect((await stored()).status).toBe("paid");
    }
  );
  it.each(["list", "intent", "charge", "save"])(
    "retries one-time %s failures without dropping the event",
    async (at) => {
      await setup();
      intent("succeeded", "ch_fixture");
      client.charges.retrieve.mockResolvedValue({ refunded: true });
      const fn = {
        charge: client.charges.retrieve,
        intent: client.paymentIntents.retrieve,
        list: client.checkout.sessions.list,
      }[at];
      if (fn) {
        fn.mockRejectedValueOnce(new Error("offline"));
      } else {
        vi.spyOn(state.database, "update").mockImplementationOnce(() => {
          throw new Error("offline");
        });
      }
      expect((await send()).status).toBe(503);
      expect((await send()).status).toBe(200);
      expect((await stored()).status).toBe("refunded");
    }
  );
});
describe("database and authorization edge failures", () => {
  it("blocks concurrent different-ID schedules for the same tenant/property using the database constraint", async () => {
    await property();
    const results = await Promise.all([
      create(billingData(), crypto.randomUUID()),
      create(billingData(), crypto.randomUUID()),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(client.subscriptionSchedules.create).toHaveBeenCalledTimes(1);
    expect(
      await state.database.select().from(schema.rentSchedules)
    ).toHaveLength(1);
  });
  it("fails closed if the link signing secret is missing", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() => linkToken("payment", id)).toThrow("Signing secret");
  });
  it("does not claim an activating enrollment was canceled", async () => {
    await readyBank({ status: "activating" });
    await expect(stopAutopay(id)).rejects.toThrow("being activated");
    expect((await stored(schema.rentSchedules)).status).toBe("activating");
  });
  it("treats completed enrollment as already stopped", async () => {
    await readyBank({ status: "completed" });
    await stopAutopay(id);
    expect(client.subscriptionSchedules.cancel).not.toHaveBeenCalled();
  });
  it("returns enrollment failure without clearing a previously recorded consent", async () => {
    await schedule();
    client.customers.create.mockImplementation(async () => {
      vi.spyOn(state.database, "update").mockImplementationOnce(() => {
        throw new Error("DB offline");
      });
      return { id: "cus_fixture" };
    });
    expect((await ach()).status).toBe(503);
    expect((await stored(schema.rentSchedules)).status).toBe(
      "creating_checkout"
    );
    expect((await stored(schema.rentSchedules)).consentedAt).toBeInstanceOf(
      Date
    );
    expect(client.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("recovers activation after provider success but failed local schedule persistence", async () => {
    await readyBank();
    bank();
    client.subscriptionSchedules.create.mockImplementationOnce(async () => {
      vi.spyOn(state.database, "update").mockImplementationOnce(() => {
        throw new Error("offline");
      });
      return { id: "sub_sched_fixture", status: "active" };
    });
    await expect(activateAutopay("seti_fixture")).rejects.toThrow();
    expect((await stored(schema.rentSchedules)).status).toBe("activating");
    client.subscriptionSchedules.list.mockResolvedValue({
      data: [
        {
          id: "sub_sched_fixture",
          metadata: { rentScheduleId: id },
          status: "active",
        },
      ],
    });
    await activateAutopay("seti_fixture");
    expect((await stored(schema.rentSchedules)).status).toBe("active");
    expect(client.subscriptionSchedules.create).toHaveBeenCalledTimes(1);
  });
  it("returns conflict for expired enrollment setup instead of recreating bank authorization", async () => {
    await readyBank();
    client.checkout.sessions.retrieve.mockResolvedValue({ status: "expired" });
    expect((await ach()).status).toBe(409);
    expect(client.customers.create).not.toHaveBeenCalled();
  });
  it("rejects a missing stop enrollment and wrong-purpose link", async () => {
    expect((await ach({ action: "stop" })).status).toBe(404);
    expect((await ach({ token: linkToken("payment", id) })).status).toBe(404);
  });
  it("does not activate an enrollment removed before bank verification finishes", async () => {
    await readyBank();
    bank();
    await state.database.insert(schema.removedRecords).values({
      actor: "fixture",
      entityId: id,
      groupId: id,
      kind: "rentSchedule",
      label: "Fixture",
    });
    await activateAutopay("seti_fixture");
    expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
  });
  it("supports both expanded and string Stripe object references", async () => {
    await readyBank();
    bank({
      mandate: { id: "mandate_fixture" },
      payment_method: { id: "pm_fixture" },
    });
    client.checkout.sessions.retrieve.mockResolvedValue({
      client_reference_id: id,
      setup_intent: { id: "seti_fixture" },
    });
    await activateAutopay("seti_fixture");
    expect(client.subscriptionSchedules.create).toHaveBeenCalledTimes(1);
  });
});
describe("owner billing database availability", () => {
  it("returns a retryable response when the database connection cannot be opened", async () => {
    vi.mocked(db).mockImplementationOnce(() => {
      throw new Error("DB connection unavailable");
    });
    expect((await create()).status).toBe(503);
    expect(client.customers.create).not.toHaveBeenCalled();
  });
});
describe("provider pagination and recovery", () => {
  it("finds and cancels an orphan schedule beyond the first page", async () => {
    await readyBank();
    client.subscriptionSchedules.list
      .mockResolvedValueOnce({
        data: [{ id: "older", metadata: {}, status: "completed" }],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [
          { id: "orphan", metadata: { rentScheduleId: id }, status: "active" },
        ],
        has_more: false,
      });
    await stopAutopay(id);
    expect(
      client.subscriptionSchedules.list.mock.calls[1][0].starting_after
    ).toBe("older");
    expect(client.subscriptionSchedules.cancel).toHaveBeenCalledWith("orphan", {
      invoice_now: false,
      prorate: false,
    });
  });
  it("recovers activation beyond the first schedule page without creating a duplicate", async () => {
    await readyBank();
    bank();
    client.subscriptionSchedules.list
      .mockResolvedValueOnce({
        data: [{ id: "other", metadata: {} }],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "recovered",
            metadata: { rentScheduleId: id },
            status: "active",
          },
        ],
        has_more: false,
      });
    await activateAutopay("seti_fixture");
    expect((await stored(schema.rentSchedules)).stripeScheduleId).toBe(
      "recovered"
    );
    expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
  });
  it("reconciles a bank return found on a later invoice-payment page", async () => {
    await readyBank();
    client.invoicePayments.list
      .mockResolvedValueOnce({
        data: [{ id: "ip_old", payment: { payment_intent: null } }],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "ip_new",
            payment: {
              payment_intent: {
                created: 2,
                id: "pi_fixture",
                latest_charge: { refunded: true },
                status: "succeeded",
              },
            },
          },
        ],
        has_more: false,
      });
    await reconcile({ status: "paid" });
    expect((await stored()).status).toBe("refunded");
    expect(client.invoicePayments.list.mock.calls[1][0].starting_after).toBe(
      "ip_old"
    );
  });
  it("returns a retryable failure if pagination loops or claims an empty next page", async () => {
    await readyBank();
    for (const data of [[], [{ id: "same", metadata: {} }]]) {
      client.subscriptionSchedules.list.mockResolvedValue({
        data,
        has_more: true,
      });
      await expect(stopAutopay(id)).rejects.toThrow("pagination");
      expect((await stored(schema.rentSchedules)).status).toBe("canceling");
    }
  });
});
describe("payment-request creation, cancellation and audit connection", () => {
  const command = (action: string, extra = {}) =>
    manage(request("/api/admin/management", { action, id, ...extra }));
  it("creates an immutable payment request and audit entry atomically; repeated creation is idempotent", async () => {
    await property();
    const data = {
      amountCents: 125_000,
      category: "deposit",
      description: "Deposit",
      dueDate: "2099-01-10",
      payerEmail: "tenant@example.invalid",
      payerName: "Tenant",
      propertyId,
    };
    expect((await command("invoice", { data })).status).toBe(200);
    expect(
      (await command("invoice", { data: { ...data, amountCents: 1 } })).status
    ).toBe(400);
    expect(
      (await command("invoice", { data: { ...data, amountCents: 250_000 } }))
        .status
    ).toBe(200);
    expect((await stored()).amountCents).toBe(125_000);
    expect(
      await state.database.select().from(schema.managementEvents)
    ).toHaveLength(1);
    expect(client.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("rolls back the request if its audit entry cannot be stored", async () => {
    await property();
    await pg.exec(
      `ALTER TABLE management_events ADD CONSTRAINT fixture_audit_failure CHECK (action <> 'invoice')`
    );
    try {
      expect(
        (
          await command("invoice", {
            data: {
              amountCents: 125_000,
              category: "rent",
              description: "Rent",
              dueDate: "2099-01-10",
              payerEmail: "tenant@example.invalid",
              payerName: "Tenant",
              propertyId,
            },
          })
        ).status
      ).toBe(409);
      expect(await stored()).toBeUndefined();
    } finally {
      await pg.exec(
        "ALTER TABLE management_events DROP CONSTRAINT fixture_audit_failure"
      );
    }
  });
  it("expires open checkout before voiding the request and preserves the audit trail", async () => {
    await invoice({ stripeSessionId: "cs_fixture" });
    expect((await command("voidInvoice")).status).toBe(200);
    expect(client.checkout.sessions.expire).toHaveBeenCalledWith("cs_fixture");
    expect((await stored()).status).toBe("void");
    expect(
      await state.database.select().from(schema.managementEvents)
    ).toHaveLength(1);
    expect((await command("voidInvoice")).status).toBe(200);
    expect(client.checkout.sessions.expire).toHaveBeenCalledTimes(1);
  });
  it.each(["paid", "processing", "creating_checkout", "failed"])(
    "refuses cancellation of a %s request",
    async (status) => {
      await invoice({ status });
      expect((await command("voidInvoice")).status).toBe(409);
      expect(client.checkout.sessions.expire).not.toHaveBeenCalled();
    }
  );
  it("refuses to void a submitted checkout", async () => {
    await invoice({ stripeSessionId: "cs_fixture" });
    client.checkout.sessions.retrieve.mockResolvedValue({ status: "complete" });
    expect((await command("voidInvoice")).status).toBe(409);
    expect((await stored()).status).toBe("open");
  });
  it("voids the hosted Stripe invoice before recording local cancellation", async () => {
    await invoice({ stripeInvoiceId: "in_fixture" });
    client.invoices.voidInvoice.mockResolvedValue({});
    expect((await command("voidInvoice")).status).toBe(200);
    expect(client.invoices.voidInvoice).toHaveBeenCalledWith("in_fixture");
    expect((await stored()).status).toBe("void");
  });
  it.each(["retrieve", "expire", "hosted invoice"])(
    "does not record local cancellation after a %s failure",
    async (at) => {
      await invoice({
        stripeInvoiceId: at === "hosted invoice" ? "in_fixture" : null,
        stripeSessionId: at === "hosted invoice" ? null : "cs_fixture",
      });
      const resolveFn5 = () => {
        if (at === "retrieve") {
          return client.checkout.sessions.retrieve;
        }
        if (at === "expire") {
          return client.checkout.sessions.expire;
        }
        return client.invoices.voidInvoice;
      };
      const fn = resolveFn5();
      fn.mockRejectedValue(new Error("offline"));
      expect((await command("voidInvoice")).status).toBe(409);
      expect((await stored()).status).toBe("open");
    }
  );
  it("does not void a payment that settles during cancellation", async () => {
    await invoice({ stripeSessionId: "cs_fixture" });
    client.checkout.sessions.expire.mockImplementation(async () => {
      await notify();
      return {};
    });
    expect((await command("voidInvoice")).status).toBe(409);
    expect((await stored()).status).toBe("paid");
  });
});
describe("terminal states, sparse provider records, and event routing", () => {
  it("lets the owner stop ACH and repeat an untouched invitation safely", async () => {
    await schedule();
    expect((await create({ ...billingData(), collection: "ach" })).status).toBe(
      200
    );
    expect((await cancel()).status).toBe(200);
    expect((await stored(schema.rentSchedules)).status).toBe("canceled");
    expect(client.subscriptionSchedules.cancel).not.toHaveBeenCalled();
  });
  it("can start a manual invoice schedule today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-10T10:00:00Z"));
    try {
      await property();
      expect(
        (await create({ ...billingData(), firstDate: "2030-01-10" })).status
      ).toBe(200);
      expect(
        client.subscriptionSchedules.create.mock.calls[0][0].start_date
      ).toBe("now");
    } finally {
      vi.useRealTimers();
    }
  });
  it("ignores an already-terminal provider schedule while stopping future collection", async () => {
    await readyBank({ setupSessionId: null });
    client.subscriptionSchedules.list.mockResolvedValue({
      data: [
        {
          id: "finished",
          metadata: { rentScheduleId: id },
          status: "completed",
        },
      ],
    });
    await stopAutopay(id);
    expect((await stored(schema.rentSchedules)).status).toBe("canceled");
    expect(client.subscriptionSchedules.cancel).not.toHaveBeenCalled();
  });
  it("does not reactivate when stopping wins before the activation claim", async () => {
    await readyBank();
    bank();
    client.paymentMethods.retrieve.mockImplementation(async () => {
      await state.database
        .update(schema.rentSchedules)
        .set({ status: "canceled" });
      return { customer: "cus_fixture", type: "us_bank_account" };
    });
    await activateAutopay("seti_fixture");
    expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
    expect((await stored(schema.rentSchedules)).status).toBe("canceled");
  });
  it("ignores setup failures for an already-active enrollment", async () => {
    await readyBank({ status: "active" });
    bank({ status: "requires_action" });
    await activateAutopay("seti_fixture");
    expect((await stored(schema.rentSchedules)).status).toBe("active");
  });
  it("ignores active mandates and unrelated setup-intent events", async () => {
    client.mandates.retrieve.mockResolvedValue({ status: "active" });
    expect(
      (
        await webhook(
          webhookRequest(event("mandate.updated", { id: "mandate_fixture" }))
        )
      ).status
    ).toBe(200);
    expect(
      (
        await webhook(
          webhookRequest(
            event("setup_intent.succeeded", {
              id: "seti_fixture",
              metadata: {},
            })
          )
        )
      ).status
    ).toBe(200);
    expect(client.setupIntents.retrieve).not.toHaveBeenCalled();
  });
  it("revokes an expanded bank-method reference and respects the mandate environment", async () => {
    await readyBank({ status: "active", stripePaymentMethodId: "pm_fixture" });
    client.mandates.retrieve.mockResolvedValue({
      livemode: true,
      payment_method: { id: "pm_fixture" },
      status: "inactive",
    });
    expect(
      (
        await webhook(
          webhookRequest(event("mandate.updated", { id: "mandate_fixture" }))
        )
      ).status
    ).toBe(200);
    expect((await stored(schema.rentSchedules)).status).toBe("active");
    client.mandates.retrieve.mockResolvedValue({
      livemode: false,
      payment_method: { id: "pm_fixture" },
      status: "inactive",
    });
    expect(
      (
        await webhook(
          webhookRequest(event("mandate.updated", { id: "mandate_fixture" }))
        )
      ).status
    ).toBe(200);
    expect((await stored(schema.rentSchedules)).status).toBe("canceled");
  });
  it("accepts setup checkout with an expanded setup-intent reference", async () => {
    await readyBank();
    bank();
    client.checkout.sessions.retrieve.mockResolvedValue({
      client_reference_id: id,
      setup_intent: { id: "seti_fixture" },
    });
    expect(
      (
        await webhook(
          webhookRequest(
            event("checkout.session.completed", {
              id: "cs_fixture",
              metadata: { rentScheduleId: id },
              mode: "setup",
            })
          )
        )
      ).status
    ).toBe(200);
    expect(client.subscriptionSchedules.create).toHaveBeenCalledTimes(1);
  });
  it("ignores subscription and charge events with no app relationship", async () => {
    await handleBillingEvent(
      event("subscription_schedule.updated", { id: "other", metadata: {} })
    );
    await handleBillingEvent(
      event("charge.failed", { id: "other", payment_intent: null })
    );
    expect(client.subscriptionSchedules.retrieve).not.toHaveBeenCalled();
    expect(client.invoicePayments.list).not.toHaveBeenCalled();
  });
  it("ignores a schedule whose current metadata no longer identifies this app", async () => {
    client.subscriptionSchedules.retrieve.mockResolvedValue({ metadata: {} });
    await handleBillingEvent(
      event("subscription_schedule.updated", {
        id: "other",
        metadata: { rentScheduleId: id },
      })
    );
    expect(await stored()).toBeUndefined();
  });
  it("handles expanded invoice records and skips deleted invoices", async () => {
    await readyBank();
    client.invoicePayments.list
      .mockResolvedValueOnce({
        data: [
          { invoice: { deleted: true } },
          { invoice: providerInvoice({ status: "paid" }) },
        ],
      })
      .mockResolvedValue({ data: [] });
    await handleBillingEvent(
      event("payment_intent.succeeded", { id: "pi_fixture" })
    );
    expect((await stored()).status).toBe("paid");
    expect(client.invoices.retrieve).not.toHaveBeenCalled();
  });
  it("ignores an invoice whose current parent metadata was removed", async () => {
    await readyBank();
    client.invoices.retrieve.mockResolvedValue(
      providerInvoice({ parent: null })
    );
    await handleBillingEvent(event("invoice.paid", providerInvoice()));
    expect(await stored()).toBeUndefined();
  });
  it("uses safe fallbacks for optional invoice text, date and hosted URL", async () => {
    await readyBank();
    await reconcile({
      due_date: null,
      hosted_invoice_url: null,
      lines: { data: [] },
    });
    const row = await stored();
    expect(row.description).toBe("Monthly rent");
    expect(row.dueDate).toBe("2030-03-17");
    expect(row.hostedInvoiceUrl).toBeNull();
  });
  it("does not overwrite local status with an unfinished one-time authorization", async () => {
    await invoice({ status: "open", stripeSessionId: "cs_fixture" });
    client.checkout.sessions.list.mockResolvedValue({ data: [session()] });
    client.paymentIntents.retrieve.mockResolvedValue({
      amount: 125_000,
      currency: "usd",
      latest_charge: null,
      livemode: false,
      status: "requires_action",
    });
    await handleBillingEvent(
      event("payment_intent.processing", { id: "pi_fixture" })
    );
    expect((await stored()).status).toBe("open");
  });
  it("follows all checkout-session pages when reconciling a one-time refund", async () => {
    await invoice({ status: "paid", stripeSessionId: "cs_fixture" });
    client.checkout.sessions.list
      .mockResolvedValueOnce({
        data: [{ id: "unrelated", metadata: {} }],
        has_more: true,
      })
      .mockResolvedValueOnce({ data: [session()], has_more: false });
    client.paymentIntents.retrieve.mockResolvedValue({
      amount: 125_000,
      currency: "usd",
      latest_charge: { refunded: true },
      livemode: false,
      status: "succeeded",
    });
    await handleBillingEvent(
      event("charge.refunded", {
        id: "ch_fixture",
        payment_intent: "pi_fixture",
      })
    );
    expect((await stored()).status).toBe("refunded");
    expect(client.checkout.sessions.list.mock.calls[1][0].starting_after).toBe(
      "unrelated"
    );
  });
});
describe("cancellation environment boundary", () => {
  it("does not cancel or mutate a request from another payment environment", async () => {
    await invoice({ mode: "live" });
    expect(
      (
        await manage(
          request("/api/admin/management", { action: "voidInvoice", id })
        )
      ).status
    ).toBe(409);
    expect((await stored()).status).toBe("open");
    expect(client.invoices.voidInvoice).not.toHaveBeenCalled();
  });
});
describe("failure while recording a provider failure", () => {
  it("still returns a safe retryable response when the review-state write also fails", async () => {
    await property();
    client.customers.create.mockImplementationOnce(async () => {
      vi.spyOn(pg, "query").mockRejectedValueOnce(new Error("DB unavailable"));
      throw new Error("Stripe unavailable");
    });
    expect((await create()).status).toBe(503);
    expect((await stored(schema.rentSchedules)).status).toBe("creating");
    expect((await create()).status).toBe(409);
    expect(client.customers.create).toHaveBeenCalledTimes(1);
  });
});

it("ignores checkout events without an ACH enrollment relationship", async () => {
  await handleAutopayEvent(
    event("checkout.session.completed", { metadata: {}, mode: "payment" })
  );
  expect(client.checkout.sessions.retrieve).not.toHaveBeenCalled();
});
