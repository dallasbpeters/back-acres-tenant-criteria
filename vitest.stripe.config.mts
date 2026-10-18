import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/stripe/server-only.ts", import.meta.url)
      ),
    },
  },
  test: {
    coverage: {
      include: [
        "app/api/payments/**",
        "app/api/admin/billing/route.ts",
        "lib/management/stripe.ts",
        "lib/management/autopay.ts",
        "lib/management/billing-events.ts",
        "lib/management/checkout-events.ts",
        "lib/management/security.ts",
        "lib/management/payment-recovery.ts",
        "lib/management/authorization-receipt.ts",
        "app/api/internal/payment-recovery/route.ts",
      ],
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      thresholds: { branches: 98, functions: 100, lines: 100, statements: 99 },
    },
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["tests/stripe/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
