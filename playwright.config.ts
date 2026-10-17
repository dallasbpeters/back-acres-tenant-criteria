import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: { baseURL: "http://localhost:3191", headless: true, channel: "chrome" },
  reporter: "list",
});
