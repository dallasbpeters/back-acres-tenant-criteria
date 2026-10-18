import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { requireValue } from "@/lib/required";

loadEnvConfig(process.cwd());
export default defineConfig({
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ||
      requireValue(
        process.env.DATABASE_URL,
        "Expected process.env.DATABASE_URL"
      ),
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
});
