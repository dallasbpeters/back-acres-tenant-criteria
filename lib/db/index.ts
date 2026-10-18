import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
// biome-ignore lint/performance/noNamespaceImport: Drizzle needs the complete schema object, including relationships, for this server-only database/test adapter.
import * as schema from "./schema";
export function db() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Database is not configured.");
  }
  return drizzle(process.env.DATABASE_URL, { schema });
}
