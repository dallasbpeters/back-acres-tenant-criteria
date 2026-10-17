import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverVersion } from "../lib/adverse/delivery";
test("concurrent sends make only one provider call", async () => {
  let claimed = false;
  let sends = 0;
  let receipt = "";
  const deps = {
    claim: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    send: async () => {
      sends++;
      return { ok: true, status: 200, id: "provider-id" };
    },
    record: async (status: string, id?: string) => {
      receipt = `${status}:${id}`;
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
    send: async () => {
      sends++;
      throw new Error("timeout");
    },
    record: async (s) => {
      status = s;
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
      send: async () => ({ ok: false, status: code }),
      record: async (s) => {
        status = s;
      },
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
      send: async () => {
        sent = true;
        return { ok: true, status: 200 };
      },
      record: async () => {},
    }),
  );
  assert.equal(sent, false);
  const statuses: string[] = [];
  const result = await deliverVersion({
    claim: async () => true,
    send: async () => ({ ok: true, status: 200, id: "id" }),
    record: async (s) => {
      statuses.push(s);
      if (s === "accepted") throw new Error("db");
    },
  });
  assert.equal(result.status, 502);
  assert.deepEqual(statuses, ["accepted", "unknown"]);
});
