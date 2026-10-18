import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

interface Condition {
  neg?: boolean;
  op: string;
  type: string;
  value: string;
}
interface Rule {
  action: {
    mitigate: {
      action: string;
      rateLimit: {
        algo: string;
        window: number;
        limit: number;
        keys: string[];
        action: string;
      };
    };
  };
  active: boolean;
  conditionGroup: { conditions: Condition[] }[];
  name: string;
}
const policy: { rules: Rule[] } = JSON.parse(
  readFileSync(
    new URL("../infrastructure/api-rate-limits.json", import.meta.url),
    "utf8"
  )
);
const dynamicSegment = /\[.*?\]/g;
function matching(path: string) {
  return policy.rules.filter((rule) =>
    rule.conditionGroup.some((group) =>
      group.conditions.every((condition) => {
        assert.equal(condition.type, "path");
        assert.ok(["re", "eq"].includes(condition.op));
        const matches =
          condition.op === "eq"
            ? path === condition.value
            : new RegExp(condition.value).test(path);
        return condition.neg ? !matches : matches;
      })
    )
  );
}

test("every API handler matches exactly one edge rate-limit policy", () => {
  const routes = readdirSync(new URL("../app/api/", import.meta.url), {
    encoding: "utf8",
    recursive: true,
  })
    .filter((path) => path.endsWith("/route.ts"))
    .map(
      (path) => `/api/${path.slice(0, -9).replace(dynamicSegment, "test-id")}`
    );
  assert.ok(routes.length >= 20);
  for (const route of routes) {
    assert.equal(matching(route).length, 1, route);
  }
  assert.equal(matching("/api/future-feature")[0]?.name, "API general traffic");
  assert.equal(matching("/api")[0]?.name, "API general traffic");
});

test("webhooks, OAuth and revocation have separate budgets from public intake", () => {
  assert.equal(
    matching("/api/payments/webhook")[0]?.action.mitigate.rateLimit.limit,
    1200
  );
  assert.equal(
    matching("/api/auth/callback/google")[0]?.action.mitigate.rateLimit.limit,
    60
  );
  assert.equal(
    matching("/api/payments/autopay")[0]?.action.mitigate.rateLimit.limit,
    600
  );
  assert.equal(
    matching("/api/lease-signing/test-token")[0]?.action.mitigate.rateLimit
      .limit,
    30
  );
  assert.equal(
    matching("/api/payments/webhook-future")[0]?.name,
    "API general traffic"
  );
});

test("edge limits use trusted per-IP counters and return 429 without touching site pages", () => {
  for (const rule of policy.rules) {
    assert.equal(rule.active, true);
    assert.equal(rule.action.mitigate.action, "rate_limit");
    assert.deepEqual(rule.action.mitigate.rateLimit.keys, ["ip"]);
    assert.equal(rule.action.mitigate.rateLimit.algo, "fixed_window");
    assert.equal(rule.action.mitigate.rateLimit.window, 60);
    assert.equal(rule.action.mitigate.rateLimit.action, "rate_limit");
  }
  for (const path of [
    "/properties",
    "/admin",
    "/sign/lease/token",
    "/_next/static/test.js",
    "/api-other",
  ]) {
    assert.equal(matching(path).length, 0, path);
  }
});
