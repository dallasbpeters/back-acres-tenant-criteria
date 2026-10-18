// biome-ignore-all lint/performance/noAwaitInLoops: Migration and transaction statements execute in database order.
"use strict";
const { createServer } = require("node:http");
const { readFileSync, readdirSync } = require("node:fs");
const { PGlite, types } = require("@electric-sql/pglite");
const Stripe = require("stripe");

module.exports = async function services({ control, origin, secret }) {
  const pg = new PGlite();
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await pg.exec(readFileSync(`drizzle/${file}`, "utf8"));
  }
  const mail = [],
    calls = [],
    sessions = new Map(),
    schedules = new Map();
  const stripe = new Stripe("sk_test_simulated");
  const address = "http://localhost:3194";
  const json = (res, data, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const query = (client, q) =>
    client.query(q.query ?? q.sql, q.params ?? [], {
      parsers: {
        [types.TIMESTAMP]: (v) => v,
        [types.TIMESTAMPTZ]: (v) => v,
        [types.DATE]: (v) => v,
      },
      rowMode: q.rowMode ?? "object",
    });
  const webhook = async (type, object) => {
    const payload = JSON.stringify({
      data: { object },
      id: `evt_${crypto.randomUUID()}`,
      livemode: false,
      object: "event",
      type,
    });
    const result = await fetch(`${origin}/api/payments/webhook`, {
      body: payload,
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripe.webhooks.generateTestHeaderString({
          payload,
          secret,
        }),
      },
      method: "POST",
    });
    if (!result.ok) {
      throw new Error(
        `App rejected simulated signed event: ${result.status} ${await result.text()}`
      );
    }
  };
  async function handleControl(req, res, url, raw) {
    if (req.headers.authorization !== `Bearer ${control}`) {
      return json(res, { error: "Not authorized" }, 401);
    }
    if (url.pathname === "/state") {
      return json(res, { calls, mail });
    }
    const body = JSON.parse(raw);
    if (url.pathname === "/mail") {
      if (
        !body.to.every(
          (email) =>
            email.endsWith("@example.invalid") ||
            email === process.env.TENANT_TEST_EMAIL
        )
      ) {
        throw new Error("Test mail recipient required");
      }
      mail.push(body);
      return json(res, { id: `mail_${crypto.randomUUID()}` });
    }
    if (body.queries) {
      return json(
        res,
        await pg.transaction(async (tx) => {
          const results = [];
          for (const statement of body.queries) {
            results.push(await query(tx, statement));
          }
          return results;
        })
      );
    }
    return json(res, await query(pg, body));
  }
  function renderCheckout(res, url) {
    const session = sessions.get(url.pathname.split("/").pop());
    if (!session) {
      return json(res, { error: "Unknown simulated session" }, 404);
    }
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(
      `<h1>Simulated Stripe ${session.mode === "setup" ? "bank setup" : "payment"}</h1><p>TEST ONLY. No connection to Stripe or a bank. No money moves.</p><form method="post" action="/complete/${session.id}"><button>Complete simulated ${session.mode === "setup" ? "bank verification" : "payment"}</button></form>`
    );
  }
  async function handleHosted(req, res, url) {
    // This server is a test double, not Stripe Checkout. It never accepts bank/card numbers.
    if (url.pathname.startsWith("/checkout/")) {
      return renderCheckout(res, url);
    }
    if (url.pathname.startsWith("/complete/") && req.method === "POST") {
      const session = sessions.get(url.pathname.split("/").pop());
      if (!session) {
        throw new Error("Unknown simulated session");
      }
      session.status = "complete";
      if (session.mode === "setup") {
        session.setup_intent = `seti_${session.id}`;
        await webhook("checkout.session.completed", session);
      } else {
        session.payment_status = "unpaid";
        await webhook("checkout.session.completed", session);
      }
      res.writeHead(303, { location: session.success_url });
      return res.end();
    }
    if (url.pathname.startsWith("/settle/") && req.method === "POST") {
      if (req.headers.authorization !== `Bearer ${control}`) {
        return json(res, {}, 401);
      }
      const session = sessions.get(url.pathname.split("/").pop());
      session.payment_status = "paid";
      await webhook("checkout.session.async_payment_succeeded", session);
      await webhook("checkout.session.async_payment_succeeded", session);
      return json(res, { ok: true });
    }

    throw new Error("Unknown simulated checkout route");
  }
  function changeSchedule(res, route, params) {
    const parts = route.split("/"),
      schedule = schedules.get(parts[3]);
    if (!schedule) {
      throw new Error("Unexpected schedule lookup");
    }
    if (parts[4] === "cancel") {
      if (
        params.get("invoice_now") !== "false" ||
        params.get("prorate") !== "false"
      ) {
        throw new Error("Cancellation must not create a charge");
      }
      schedule.status = "canceled";
    }
    return json(res, schedule);
  }
  function handleBilling(req, res, route, params) {
    if (route === "/v1/products" && req.method === "POST") {
      return json(res, { id: "prod_simulated" });
    }
    if (route === "/v1/subscription_schedules" && req.method === "GET") {
      return json(res, { data: [...schedules.values()], has_more: false });
    }
    if (route === "/v1/subscription_schedules" && req.method === "POST") {
      const schedule = {
        id: `sub_sched_${crypto.randomUUID()}`,
        metadata: { rentScheduleId: params.get("metadata[rentScheduleId]") },
        status: "not_started",
      };
      schedules.set(schedule.id, schedule);
      return json(res, schedule);
    }
    if (route.startsWith("/v1/subscription_schedules/")) {
      return changeSchedule(res, route, params);
    }

    throw new Error("Unknown simulated billing route");
  }
  function handleStripe(req, res, url, raw) {
    const params = new URLSearchParams(raw),
      route = url.pathname;
    calls.push({ method: req.method, path: route });
    if (req.method === "POST" && route === "/v1/customers") {
      return json(res, { id: `cus_${crypto.randomUUID()}` });
    }
    if (req.method === "POST" && route === "/v1/checkout/sessions") {
      const id = `cs_test_${crypto.randomUUID()}`;
      const session = {
        amount_total: Number(
          params.get("line_items[0][price_data][unit_amount]")
        ),
        client_reference_id: params.get("client_reference_id"),
        currency: "usd",
        customer: params.get("customer"),
        id,
        livemode: false,
        metadata: params.get("metadata[rentScheduleId]")
          ? { rentScheduleId: params.get("metadata[rentScheduleId]") }
          : { invoiceId: params.get("metadata[invoiceId]") },
        mode: params.get("mode"),
        object: "checkout.session",
        payment_status: "unpaid",
        status: "open",
        success_url: params.get("success_url"),
        url: `${address}/checkout/${id}`,
      };
      sessions.set(id, session);
      return json(res, session);
    }
    if (route.startsWith("/v1/checkout/sessions/")) {
      const pieces = route.split("/"),
        session = sessions.get(pieces[4]);
      if (!session) {
        throw new Error("Unexpected session lookup");
      }
      if (pieces[5] === "expire") {
        session.status = "expired";
      }
      return json(res, session);
    }
    return handleBank(req, res, route, params);
  }
  function handleBank(req, res, route, params) {
    if (route.startsWith("/v1/setup_intents/")) {
      const id = route.split("/").pop();
      const session = [...sessions.values()].find((s) => s.setup_intent === id);
      if (!session) {
        throw new Error("Unexpected setup intent lookup");
      }
      return json(res, {
        customer: session.customer,
        id,
        livemode: false,
        mandate: `mandate_${session.id}`,
        metadata: session.metadata,
        object: "setup_intent",
        payment_method: `pm_${session.id}`,
        status: "succeeded",
      });
    }
    if (route.startsWith("/v1/mandates/")) {
      return json(res, { id: route.split("/").pop(), status: "active" });
    }
    if (route.startsWith("/v1/payment_methods/")) {
      const id = route.split("/").pop(),
        session = sessions.get(id.slice(3));
      if (!session) {
        throw new Error("Unexpected payment method lookup");
      }
      return json(res, {
        customer: session.customer,
        id,
        type: "us_bank_account",
      });
    }

    return handleBilling(req, res, route, params);
  }
  const server = createServer(async (req, res) => {
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
      }
      const url = new URL(req.url, address);
      if (["/database", "/mail", "/state"].includes(url.pathname)) {
        return await handleControl(req, res, url, raw);
      }
      if (url.pathname.startsWith("/v1/")) {
        return handleStripe(req, res, url, raw);
      }
      return await handleHosted(req, res, url);
    } catch (error) {
      json(res, { error: error.message }, 500);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(3194, "localhost", resolve);
  });
  return {
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await pg.close();
    },
  };
};
