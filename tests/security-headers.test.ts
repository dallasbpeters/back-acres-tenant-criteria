import assert from "node:assert/strict";
import test from "node:test";
import config from "../next.config";

test("security headers protect all pages, including private token links", async () => {
  const rules = await config.headers?.();
  assert.ok(rules);
  const global = rules.find((rule) => rule.source === "/:path*");
  assert.ok(global);
  const headers = Object.fromEntries(
    global.headers.map((header) => [header.key, header.value])
  );
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  const policy = headers["Content-Security-Policy"];
  assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.ok(policy.includes("object-src 'none'"));
  assert.ok(policy.includes("base-uri 'self'"));
  assert.ok(policy.includes("default-src 'self'"));
  assert.ok(policy.includes("worker-src 'self' blob:"));
  assert.ok(policy.includes("https://clerk.backacresrentals.com"));
  assert.ok(!policy.includes("'unsafe-eval'"));
});
