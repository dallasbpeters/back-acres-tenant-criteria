import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "@playwright/test";

// Load env files as `next dev` does (dev=true), so a .env.development.local
// override is seen here exactly as the dev server sees it.
loadEnvConfig(process.cwd(), true);
// Clerk production keys only work on the production domain. On localhost the
// sign-in widget never loads and pages that use Clerk keep reloading, which
// makes tests fail at random. Stop early with the actual cause instead.
if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")) {
  throw new Error(
    "Browser tests need Clerk development keys (pk_test_/sk_test_). The local env has Clerk production keys, which only work on backacresrentals.com."
  );
}

// The specs and the dev server must agree on these test-only values. Setting
// them here makes the suite run the same from the CLI and from the VS Code
// Playwright extension, which passes no extra environment.
const testEnv = {
  ADMIN_EMAILS: "admin-test@example.invalid",
  FROM_EMAIL: "test@example.com",
  PAYMENTS_LIVE_ENABLED: "false",
  RESEND_API_KEY: "test-no-email-delivery",
  STRIPE_WEBHOOK_SECRET: "whsec_test_only",
};
Object.assign(process.env, testEnv);

function stripeTestKey(): Record<string, string> {
  let key: string;
  try {
    key = readFileSync(".env.stripe-key", "utf8").trim();
  } catch {
    return {};
  }
  if (!key.startsWith("sk_test_")) {
    throw new Error(".env.stripe-key must hold a Stripe test key (sk_test_).");
  }
  return { STRIPE_SECRET_KEY: key };
}

export default defineConfig({
  reporter: "list",
  testDir: "./tests/browser",
  use: { baseURL: "http://localhost:3191", channel: "chrome", headless: true },
  webServer: {
    command: "npx next dev --port 3191",
    env: { ...testEnv, ...stripeTestKey() },
    // A server already on 3191 must have been started with the values above.
    reuseExistingServer: true,
    timeout: 120_000,
    url: "http://localhost:3191/api/branding",
  },
  workers: 1,
});
