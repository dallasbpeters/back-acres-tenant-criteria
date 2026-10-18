import { defineConfig } from "@playwright/test";

const watching = process.env.TENANT_TEST_WATCH === "1";

export default defineConfig({
  expect: { timeout: 30_000 },
  outputDir: "test-results/tenant-workflow",
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "playwright-report/tenant-workflow" },
    ],
  ],
  testDir: "./tests/workflow",
  timeout: watching ? 420_000 : 240_000,
  use: {
    actionTimeout: 20_000,
    baseURL: "http://localhost:3193",
    channel: "chrome",
    headless: true,
    launchOptions: { slowMo: watching ? 200 : 0 },
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "on",
  },
  workers: 1,
});
