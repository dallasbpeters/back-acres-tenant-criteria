// biome-ignore-all lint/suspicious/useAwait: Async transport stubs intentionally preserve native promise and rejection behavior, including faults before the first await.
"use strict";
// Test-process-only transport. Never imported by application code.
const fs = require("node:fs");
const originalFetch = global.fetch;
global.fetch = async (url, init) => {
  if (String(url) !== "https://api.resend.com/emails") {
    return originalFetch(url, init);
  }
  if (!process.env.LEASE_SIGNING_TEST_OUTBOX) {
    throw new Error("Test outbox is required.");
  }
  const message = JSON.parse(init.body);
  if (!message.to.every((email) => email.endsWith("@example.invalid"))) {
    throw new Error("Only isolated fixture recipients are allowed.");
  }
  fs.appendFileSync(
    process.env.LEASE_SIGNING_TEST_OUTBOX,
    `${JSON.stringify(message)}\n`
  );
  return new Response(JSON.stringify({ id: crypto.randomUUID() }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
};
