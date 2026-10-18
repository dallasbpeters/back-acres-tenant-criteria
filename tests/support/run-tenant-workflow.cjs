// biome-ignore-all lint/performance/noAwaitInLoops: Server readiness and shutdown require ordered polling.
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { createClerkClient } = require("@clerk/backend");
const services = require("./tenant-services.cjs");
require("@next/env").loadEnvConfig(process.cwd());
const root = process.cwd(),
  origin = "http://localhost:3193";
const email = "back-acres-tenant+clerk_test@example.com";
// Turbopack only compiles files inside its workspace root and will not follow a
// node_modules symlink outside it. Keep the disposable copy under the ignored
// tmp/ folder so it resolves the project's real node_modules.
fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
const directory = fs.mkdtempSync(
  path.join(root, "tmp", "tenant-workflow-app-")
);
let server, transport, testProcess;
let stopDemo;
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
async function run() {
  if (
    !(
      process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")
    )
  ) {
    throw new Error(
      "Local Clerk development keys are required. Production keys are refused."
    );
  }
  for (const port of [3193, 3194]) {
    const occupied = await fetch(`http://localhost:${port}`).then(
      () => true,
      () => false
    );
    if (occupied) {
      throw new Error(
        `Port ${port} is in use. Stop the previous tenant demo first.`
      );
    }
  }
  const users = await clerk.users.getUserList({ emailAddress: [email] });
  if (!users.data.length) {
    await clerk.users.createUser({
      emailAddress: [email],
      firstName: "Test",
      lastName: "Tenant",
      skipPasswordRequirement: true,
    });
  }
  const [tenant] = (await clerk.users.getUserList({ emailAddress: [email] }))
    .data;
  const memberships = await clerk.users.getOrganizationMembershipList({
    userId: tenant.id,
  });
  if (!memberships.data.length) {
    await clerk.organizations.createOrganization({
      createdBy: tenant.id,
      name: "Back Acres TEST household",
    });
  }
  fs.rmSync(directory, { force: true, recursive: true });
  fs.mkdirSync(directory);
  for (const item of [
    "app",
    "components",
    "lib",
    "public",
    "proxy.ts",
    "instrumentation.ts",
    "instrumentation-client.ts",
    "next.config.ts",
    "tsconfig.json",
    "next-env.d.ts",
    "package.json",
  ]) {
    fs.cpSync(path.join(root, item), path.join(directory, item), {
      recursive: true,
    });
  }
  fs.writeFileSync(
    path.join(directory, "lib/db/index.ts"),
    fs.readFileSync("tests/support/tenant-db-adapter.fixture.txt")
  );
  fs.mkdirSync(path.join(directory, "app/demo"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "app/demo/page.tsx"),
    fs.readFileSync("tests/support/tenant-demo-page.fixture.txt")
  );
  fs.mkdirSync(path.join(root, "output"), { recursive: true });
  const stripeFile = path.join(directory, "lib/management/stripe.ts");
  const stripeSource = fs.readFileSync(stripeFile, "utf8");
  const replacement = stripeSource.replace(
    '"Expected process.env.STRIPE_SECRET_KEY"\n    )',
    '"Expected process.env.STRIPE_SECRET_KEY"\n    ), { host: "localhost", port: 3194, protocol: "http", maxNetworkRetries: 0 }'
  );
  if (replacement === stripeSource) {
    throw new Error(
      "Stripe adapter boundary changed; update the isolated test runner."
    );
  }
  fs.writeFileSync(stripeFile, replacement);
  const secret = randomBytes(32).toString("hex");
  const env = {
    ADMIN_EMAILS: "owner@example.invalid",
    CLERK_AUTH_SOURCE: "local",
    CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    DATABASE_URL: "postgresql://isolated:isolated@invalid.local/isolated",
    FROM_EMAIL: "owner@example.invalid",
    GOOGLE_CLIENT_ID: "isolated",
    GOOGLE_CLIENT_SECRET: "isolated",
    HOME: process.env.HOME,
    LANDLORD_EMAIL: "owner@example.invalid",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
    NEXTAUTH_URL: origin,
    NODE_ENV: "development",
    NODE_OPTIONS: `--require=${path.join(root, "tests/support/tenant-mail-preload.cjs")}`,
    PATH: process.env.PATH,
    PAYMENTS_LIVE_ENABLED: "false",
    RESEND_API_KEY: "test-captured-only",
    STRIPE_SECRET_KEY: "sk_test_simulated",
    STRIPE_WEBHOOK_SECRET: secret,
    TANDRA_EMAIL: "other-owner@example.invalid",
    TENANT_TEST_CONTROL: randomBytes(32).toString("hex"),
    TENANT_TEST_DEMO: process.argv.includes("--demo") ? "1" : "0",
    TENANT_TEST_EMAIL: email,
    TENANT_TEST_LINKS: path.join(root, "output/tenant-workflow-links.json"),
    TENANT_TEST_SERVICE: "http://localhost:3194",
    TENANT_TEST_WATCH: process.argv.includes("--headed") ? "1" : "0",
  };
  process.env.TENANT_TEST_EMAIL = email;
  transport = await services({
    control: env.TENANT_TEST_CONTROL,
    origin,
    secret,
  });
  const log = fs.openSync(
    path.join(root, "tmp/tenant-workflow-server.log"),
    "w",
    0o600
  );
  server = spawn(
    process.execPath,
    [path.join(root, "node_modules/next/dist/bin/next"), "dev", "-p", "3193"],
    { cwd: directory, env, stdio: ["ignore", log, log] }
  );
  fs.closeSync(log);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(
        "Isolated app exited. See tmp/tenant-workflow-server.log."
      );
    }
    const response = await fetch(`${origin}/api/branding`).catch(() => null);
    if (response?.ok) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) {
    throw new Error(
      "Isolated app did not start. See tmp/tenant-workflow-server.log."
    );
  }
  const demo = process.argv.includes("--demo");
  const args = process.argv.slice(2).filter((arg) => arg !== "--demo");
  const code = await new Promise((resolve) => {
    testProcess = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        "playwright.tenant.config.ts",
        ...args,
      ],
      { cwd: root, env: { ...env, NODE_OPTIONS: "" }, stdio: "inherit" }
    );
    testProcess.on("exit", resolve);
  });
  process.exitCode = code ?? 1;
  if (code === 0 && demo) {
    console.log(
      `\nTenant demo: ${origin}/demo\nEmail: ${email}\nDevelopment verification code: 424242\nSynthetic records, captured mail and simulated Stripe only. Ctrl+C stops and clears the demo database.`
    );
    await new Promise((resolve) => {
      stopDemo = resolve;
    });
  }
}
process.once("SIGINT", () => {
  if (stopDemo) {
    stopDemo();
    return;
  }
  process.exitCode = 130;
  testProcess?.kill("SIGINT");
  if (!testProcess) {
    cleanup().finally(() => process.exit(130));
  }
});
async function cleanup() {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  await transport?.close();
  fs.rmSync(directory, { force: true, recursive: true });
}
run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cleanup);
