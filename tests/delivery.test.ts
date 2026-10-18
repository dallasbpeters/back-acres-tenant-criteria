// biome-ignore-all lint/suspicious/useAwait: Async transport stubs intentionally preserve native promise and rejection behavior, including faults before the first await.
// biome-ignore-all lint/performance/noAwaitInLoops: These stateful fixtures and assertions must finish each transition before the next request or cleanup.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverVersion } from "../lib/adverse/delivery";

test("concurrent sends make only one provider call", async () => {
  let claimed = false;
  let sends = 0;
  let receipt = "";
  const deps = {
    claim: async () => {
      if (claimed) {
        return false;
      }
      claimed = true;
      return true;
    },
    record: async (status: string, id?: string) => {
      receipt = `${status}:${id}`;
    },
    send: async () => {
      sends += 1;
      return { id: "provider-id", ok: true, status: 200 };
    },
  };
  const results = await Promise.all([
    deliverVersion(deps),
    deliverVersion(deps),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(sends, 1);
  assert.equal(receipt, "accepted:provider-id");
});
test("timeouts are uncertain and never retried automatically", async () => {
  let sends = 0;
  let status = "";
  const r = await deliverVersion({
    claim: async () => true,
    record: async (s) => {
      status = s;
    },
    send: async () => {
      sends += 1;
      throw new Error("timeout");
    },
  });
  assert.equal(r.status, 502);
  assert.equal(status, "unknown");
  assert.equal(sends, 1);
});
test("provider rejection and server failure are distinguished", async () => {
  for (const [code, expected] of [
    [422, "rejected"],
    [500, "unknown"],
  ] as const) {
    let status = "";
    await deliverVersion({
      claim: async () => true,
      record: async (s) => {
        status = s;
      },
      send: async () => ({ ok: false, status: code }),
    });
    assert.equal(status, expected);
  }
});
test("database claim failure prevents email and acceptance record failure is uncertain", async () => {
  let sent = false;
  await assert.rejects(
    deliverVersion({
      claim: async () => {
        throw new Error("db");
      },
      record: async () => {
        /* Best-effort fallback: retain the original result when this optional operation fails. */
      },
      send: async () => {
        sent = true;
        return { ok: true, status: 200 };
      },
    })
  );
  assert.equal(sent, false);
  const statuses: string[] = [];
  const result = await deliverVersion({
    claim: async () => true,
    record: async (s) => {
      statuses.push(s);
      if (s === "accepted") {
        throw new Error("db");
      }
    },
    send: async () => ({ id: "id", ok: true, status: 200 }),
  });
  assert.equal(result.status, 502);
  assert.deepEqual(statuses, ["accepted", "unknown"]);
});
