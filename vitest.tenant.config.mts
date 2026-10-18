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
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["tests/tenant/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
