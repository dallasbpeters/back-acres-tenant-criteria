// biome-ignore-all lint/suspicious/useAwait: Async transport stubs intentionally preserve native promise and rejection behavior, including faults before the first await.
// biome-ignore-all lint/performance/noAwaitInLoops: These stateful fixtures and assertions must finish each transition before the next request or cleanup.
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { type Mock, vi } from "vitest";
// biome-ignore lint/performance/noNamespaceImport: Drizzle needs the complete schema object, including relationships, for this server-only database/test adapter.
import * as schema from "../../lib/db/schema";

const state = vi.hoisted(() => ({
  // biome-ignore lint/suspicious/noExplicitAny: This test-only state swaps the Neon query interface for a PGlite adapter with transactional batch support.
  database: null as any,
  session: null as { user: { email: string } } | null,
}));
vi.mock("@/lib/db", () => ({ db: vi.fn(() => state.database) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(() => state.session) }));
const client = vi.hoisted(() => ({
  charges: { retrieve: vi.fn() },
  checkout: {
    sessions: {
      create: vi.fn(),
      expire: vi.fn(),
      list: vi.fn(),
      retrieve: vi.fn(),
    },
  },
  customers: { create: vi.fn() },
  events: { list: vi.fn() },
  invoicePayments: { list: vi.fn() },
  invoices: { retrieve: vi.fn(), voidInvoice: vi.fn() },
  mandates: { retrieve: vi.fn() },
  paymentIntents: { retrieve: vi.fn() },
  paymentMethods: { retrieve: vi.fn() },
  products: { create: vi.fn() },
  setupIntents: { cancel: vi.fn(), retrieve: vi.fn() },
  subscriptionSchedules: {
    cancel: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
    retrieve: vi.fn(),
  },
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
          httpClient: RealStripe.createFetchHttpClient(async () => {
            throw new Error(
              "External Stripe network access is forbidden in isolated tests"
            );
          }),
          maxNetworkRetries: 0,
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
    .sort()) {
    await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
  }
  state.database = drizzle(pg, { schema });
  // Neon HTTP batch is transactional. Use a real PostgreSQL transaction for the
  // corresponding PGlite calls; these routes do not consume batch return rows.
  state.database.batch = (
    queries: { toSQL: () => { sql: string; params: unknown[] } }[]
  ) =>
    pg.transaction(async (transaction) => {
      const results: unknown[] = [];
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
    })
  );
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://fixture:fixture@invalid.local/fixture"
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
    "TRUNCATE rental_invoices, rent_schedules, properties, intake_limits, removed_records, management_events CASCADE"
  );
  for (const group of Object.values(client)) {
    for (const method of Object.values(group)) {
      if (typeof method === "function") {
        (method as Mock)
          .mockReset()
          .mockRejectedValue(new Error("Unexpected Stripe call"));
      } else {
        for (const fn of Object.values(method)) {
          (fn as Mock)
            .mockReset()
            .mockRejectedValue(new Error("Unexpected Stripe call"));
        }
      }
    }
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
    data: { address: "1 Fixture St", contact: "Owner", name: "Fixture" },
    id: propertyId,
    slug: "fixture",
  });
}
export async function invoice(patch = {}) {
  await property();
  const row = {
    amountCents: 125_000,
    category: "rent",
    description: "Rent",
    dueDate: "2099-01-10",
    id,
    mode: "test",
    payerEmail: "tenant@example.invalid",
    payerName: "Tenant",
    propertyId,
    ...patch,
  };
  await state.database.insert(schema.invoices).values(row);
  return row;
}
export async function schedule(patch = {}) {
  await property();
  const row = {
    collection: "ach",
    firstDate: "2099-01-10",
    id,
    installments: 12,
    mode: "test",
    monthlyCents: 125_000,
    payerEmail: "tenant@example.invalid",
    payerName: "Tenant",
    propertyId,
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
  headers: Record<string, string> = {}
) {
  return new NextRequest(`https://rental.example.invalid${path}`, {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: "https://rental.example.invalid",
      ...headers,
    },
    method: "POST",
  });
}
export function event(type: string, object: unknown) {
  return {
    data: { object },
    id: "evt_fixture",
    livemode: false,
    type,
  } as Stripe.Event;
}
export function webhookRequest(
  e: unknown,
  secret = "whsec_isolated_fixture",
  timestamp = Math.floor(Date.now() / 1000)
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
    amount_total: 125_000,
    client_reference_id: id,
    currency: "usd",
    id: "cs_fixture",
    livemode: false,
    metadata: { invoiceId: id },
    mode: "payment",
    payment_status: "paid",
    ...patch,
  };
}
export function bank(patch = {}) {
  client.setupIntents.retrieve.mockResolvedValue({
    customer: "cus_fixture",
    id: "seti_fixture",
    livemode: false,
    mandate: "mandate_fixture",
    metadata: { rentScheduleId: id },
    payment_method: "pm_fixture",
    status: "succeeded",
    ...patch,
  });
  client.checkout.sessions.retrieve.mockResolvedValue({
    client_reference_id: id,
    id: "cs_fixture",
    setup_intent: "seti_fixture",
  });
  client.mandates.retrieve.mockResolvedValue({
    id: "mandate_fixture",
    status: "active",
  });
  client.paymentMethods.retrieve.mockResolvedValue({
    customer: "cus_fixture",
    id: "pm_fixture",
    type: "us_bank_account",
  });
}
export async function readyBank(patch = {}) {
  return schedule({
    consentedAt: new Date(),
    setupSessionId: "cs_fixture",
    status: "awaiting_verification",
    stripeCustomerId: "cus_fixture",
    ...patch,
  });
}
export { client, state };
