import assert from "node:assert/strict";
import test from "node:test";
import { requireValue } from "../lib/required";

test("required values preserve valid falsy values and reject only nullish input", () => {
  for (const value of [0, false, ""]) {
    assert.equal(requireValue(value, "Missing value"), value);
  }
  for (const value of [null, undefined]) {
    assert.throws(() => requireValue(value, "Missing value"), {
      message: "Missing value",
    });
  }
});
