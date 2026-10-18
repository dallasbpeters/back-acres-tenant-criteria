const { spawn } = require("node:child_process"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
require("@next/env").loadEnvConfig(process.cwd());
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "back-acres-signing-")),
  outbox = path.join(directory, "outbox.jsonl");
fs.writeFileSync(outbox, "");
const env = {
  ...process.env,
  ADMIN_EMAILS: "admin-test@example.invalid",
  RESEND_API_KEY: "test-no-external-delivery",
  FROM_EMAIL: "owner@example.invalid",
  NEXTAUTH_URL: "http://localhost:3191",
  LEASE_SIGNING_TEST_OUTBOX: outbox,
};
let server;
async function run() {
  try {
    await fetch(env.NEXTAUTH_URL);
    throw Error(
      "Port 3191 is in use. Stop the local test server before running test:signing.",
    );
  } catch (e) {
    if (!String(e.message).includes("fetch failed")) throw e;
  }
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-p", "3191"],
    {
      stdio: "inherit",
      env: {
        ...env,
        NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --require=${path.join(process.cwd(), "tests/support/lease-mail-preload.cjs")}`,
      },
    },
  );
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const result = await fetch(env.NEXTAUTH_URL + "/api/branding");
      if (result.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw Error("The local signing test server did not start.");
  const code = await new Promise((resolve) => {
    const tests = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "tests/browser/lease-signing.spec.ts",
      ],
      { stdio: "inherit", env },
    );
    tests.on("exit", resolve);
  });
  process.exitCode = code ?? 1;
}
run()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => {
    server?.kill("SIGTERM");
    fs.rmSync(directory, { recursive: true, force: true });
  });
process.on("SIGINT", () => {
  server?.kill("SIGTERM");
  process.exit(130);
});
