import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedEmails,
  canSignIn,
  isAllowedEmail,
} from "../lib/adverse/access";
const env = { ADMIN_EMAILS: "Owner@example.com, second@example.com " };
test("Google access requires an exact approved and verified email", () => {
  assert.equal(
    canSignIn(
      "google",
      { email: "owner@example.com", email_verified: true },
      env,
    ),
    true,
  );
  assert.equal(
    canSignIn(
      "google",
      { email: "outsider@example.com", email_verified: true },
      env,
    ),
    false,
  );
  assert.equal(
    canSignIn(
      "google",
      { email: "owner@example.com", email_verified: false },
      env,
    ),
    false,
  );
  assert.equal(
    canSignIn(
      "google",
      { email: "owner@example.com", email_verified: "true" },
      env,
    ),
    false,
  );
  assert.equal(
    canSignIn(
      "other",
      { email: "owner@example.com", email_verified: true },
      env,
    ),
    false,
  );
  assert.equal(canSignIn("google", undefined, env), false);
  assert.equal(isAllowedEmail("owner+alias@example.com", env), false);
});
test("empty configuration denies everyone; explicit list overrides owner defaults", () => {
  assert.deepEqual(allowedEmails({}), []);
  assert.equal(isAllowedEmail("owner@example.com", {}), false);
  assert.deepEqual(
    allowedEmails({
      LANDLORD_EMAIL: "owner@example.com",
      TANDRA_EMAIL: "second@example.com",
    }),
    ["owner@example.com", "second@example.com"],
  );
  assert.deepEqual(
    allowedEmails({ ADMIN_EMAILS: "", LANDLORD_EMAIL: "owner@example.com" }),
    [],
  );
  assert.equal(
    isAllowedEmail("owner@example.com", {
      ADMIN_EMAILS: "different@example.com",
      LANDLORD_EMAIL: "owner@example.com",
    }),
    false,
  );
});
