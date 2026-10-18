import { defineConfig } from "@playwright/test";
export default defineConfig({
  reporter: "list",
  testDir: "./tests/browser",
  use: { baseURL: "http://localhost:3191", channel: "chrome", headless: true },
  workers: 1,
});
