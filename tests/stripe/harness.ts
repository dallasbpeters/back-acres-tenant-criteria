import { vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { readFile, readdir } from "node:fs/promises";
import { NextRequest } from "next/server";
import Stripe from "stripe";
import * as schema from "../../lib/db/schema";
const state = vi.hoisted(() => ({
  database: null as any,
  session: null as any,
}));
vi.mock("@/lib/db", () => ({ db: vi.fn(() => state.database) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => state.session) }));
const client = vi.hoisted(() => ({
  checkout: {
    sessions: {
      create: vi.fn(),
      retrieve: vi.fn(),
      expire: vi.fn(),
      list: vi.fn(),
    },
  },
  customers: { create: vi.fn() },
  products: { create: vi.fn() },
  subscriptionSchedules: {
    create: vi.fn(),
    retrieve: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
  },
  setupIntents: { retrieve: vi.fn(), cancel: vi.fn() },
  mandates: { retrieve: vi.fn() },
  paymentMethods: { retrieve: vi.fn() },
  paymentIntents: { retrieve: vi.fn() },
  invoicePayments: { list: vi.fn() },
  invoices: { retrieve: vi.fn(), voidInvoice: vi.fn() },
  charges: { retrieve: vi.fn() },
}));
// Use the actual Stripe constructor and signature verification. Only outbound resources are replaced.
vi.mock("stripe", async (importOriginal) => {
  const { default: RealStripe } =
    await importOriginal<typeof import("stripe")>();
  return {
    default: class extends RealStripe {
      constructor(...args: ConstructorParameters<typeof RealStripe>) {
        super(args[0], {
          ...args[1],
          maxNetworkRetries: 0,
          httpClient: RealStripe.createFetchHttpClient(async () => {
            throw new Error(
              "External Stripe network access is forbidden in isolated tests",
            );
          }),
        });
        Object.assign(this, client);
      }
    },
  };
});
export let pg: PGlite;
export async function start() {
  pg = new PGlite();
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
  state.database = drizzle(pg, { schema });
  // Neon HTTP batch is transactional. Use a real PostgreSQL transaction for the
  // corresponding PGlite calls; these routes do not consume batch return rows.
  state.database.batch = (
    queries: { toSQL(): { sql: string; params: unknown[] } }[],
  ) =>
    pg.transaction(async (transaction) => {
      const results = [];
      for (const query of queries) {
        const statement = query.toSQL();
        results.push(await transaction.query(statement.sql, statement.params));
      }
      return results;
    });
}
export async function reset() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("External network access is forbidden in isolated tests");
    }),
  );
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://fixture:fixture@invalid.local/fixture",
  );
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_isolated_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_isolated_fixture");
  vi.stubEnv("PAYMENTS_LIVE_ENABLED", "false");
  vi.stubEnv("NEXTAUTH_SECRET", "isolated-link-secret");
  vi.stubEnv("NEXTAUTH_URL", "https://rental.example.invalid");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture");
  vi.stubEnv("ADMIN_EMAILS", "owner@example.invalid");
  state.session = { user: { email: "owner@example.invalid" } };
  await pg.exec(
    "TRUNCATE rental_invoices, rent_schedules, properties, intake_limits, removed_records, management_events CASCADE",
  );
  for (const group of Object.values(client))
    for (const method of Object.values(group)) {
      if (typeof method === "function")
        (method as any)
          .mockReset()
          .mockRejectedValue(new Error("Unexpected Stripe call"));
      else
        for (const fn of Object.values(method))
          (fn as any)
            .mockReset()
            .mockRejectedValue(new Error("Unexpected Stripe call"));
    }
  client.checkout.sessions.create.mockResolvedValue({
    id: "cs_fixture",
    status: "open",
    url: "https://checkout.stripe.com/fixture",
  });
  client.checkout.sessions.retrieve.mockResolvedValue({
    id: "cs_fixture",
    status: "open",
    url: "https://checkout.stripe.com/fixture",
  });
  client.checkout.sessions.expire.mockResolvedValue({});
  client.customers.create.mockResolvedValue({ id: "cus_fixture" });
  client.products.create.mockResolvedValue({ id: "prod_fixture" });
  client.subscriptionSchedules.list.mockResolvedValue({
    data: [],
    has_more: false,
  });
  client.subscriptionSchedules.create.mockResolvedValue({
    id: "sub_sched_fixture",
    status: "not_started",
  });
  client.subscriptionSchedules.cancel.mockResolvedValue({});
  client.setupIntents.cancel.mockResolvedValue({});
  client.invoicePayments.list.mockResolvedValue({ data: [] });
  client.checkout.sessions.list.mockResolvedValue({ data: [] });
}
export const id = "11111111-1111-4111-8111-111111111111";
export const propertyId = "22222222-2222-4222-8222-222222222222";
export async function property() {
  await state.database.insert(schema.properties).values({
    id: propertyId,
    slug: "fixture",
    data: { name: "Fixture", address: "1 Fixture St", contact: "Owner" },
  });
}
export async function invoice(patch = {}) {
  await property();
  const row = {
    id,
    propertyId,
    payerName: "Tenant",
    payerEmail: "tenant@example.invalid",
    category: "rent",
    description: "Rent",
    amountCents: 125000,
    dueDate: "2099-01-10",
    mode: "test",
    ...patch,
  };
  await state.database.insert(schema.invoices).values(row);
  return row;
}
export async function schedule(patch = {}) {
  await property();
  const row = {
    id,
    propertyId,
    payerName: "Tenant",
    payerEmail: "tenant@example.invalid",
    monthlyCents: 125000,
    firstDate: "2099-01-10",
    installments: 12,
    collection: "ach",
    mode: "test",
    status: "awaiting_authorization",
    ...patch,
  };
  await state.database.insert(schema.rentSchedules).values(row);
  return row;
}
export async function stored(table: AnyPgTable = schema.invoices) {
  return (await state.database.select().from(table))[0];
}
export function request(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest(`https://rental.example.invalid${path}`, {
    method: "POST",
    headers: {
      origin: "https://rental.example.invalid",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
export function event(type: string, object: any) {
  return { id: "evt_fixture", type, livemode: false, data: { object } } as any;
}
export function webhookRequest(
  e: any,
  secret = "whsec_isolated_fixture",
  timestamp = Math.floor(Date.now() / 1000),
) {
  const payload = JSON.stringify(e);
  return request("/api/payments/webhook", payload, {
    "stripe-signature": Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
      timestamp,
    }),
  });
}
export function session(patch = {}) {
  return {
    id: "cs_fixture",
    mode: "payment",
    metadata: { invoiceId: id },
    client_reference_id: id,
    amount_total: 125000,
    currency: "usd",
    livemode: false,
    payment_status: "paid",
    ...patch,
  };
}
export function bank(patch = {}) {
  client.setupIntents.retrieve.mockResolvedValue({
    id: "seti_fixture",
    metadata: { rentScheduleId: id },
    customer: "cus_fixture",
    livemode: false,
    status: "succeeded",
    payment_method: "pm_fixture",
    mandate: "mandate_fixture",
    ...patch,
  });
  client.checkout.sessions.retrieve.mockResolvedValue({
    id: "cs_fixture",
    setup_intent: "seti_fixture",
    client_reference_id: id,
  });
  client.mandates.retrieve.mockResolvedValue({
    id: "mandate_fixture",
    status: "active",
  });
  client.paymentMethods.retrieve.mockResolvedValue({
    id: "pm_fixture",
    type: "us_bank_account",
    customer: "cus_fixture",
  });
}
export async function readyBank(patch = {}) {
  return schedule({
    status: "awaiting_verification",
    consentedAt: new Date(),
    stripeCustomerId: "cus_fixture",
    setupSessionId: "cs_fixture",
    ...patch,
  });
}
export { state, client };
