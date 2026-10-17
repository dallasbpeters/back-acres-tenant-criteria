import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
loadEnvConfig(process.cwd());
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
  },
});
