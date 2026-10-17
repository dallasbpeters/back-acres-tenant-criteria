import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
  return drizzle(process.env.DATABASE_URL, { schema });
}
