import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/stripe/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/stripe/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: { lines: 100, statements: 99, branches: 98, functions: 100 },
      include: [
        "app/api/payments/**",
        "app/api/admin/billing/route.ts",
        "lib/management/stripe.ts",
        "lib/management/autopay.ts",
        "lib/management/billing-events.ts",
        "lib/management/security.ts",
      ],
    },
  },
});
