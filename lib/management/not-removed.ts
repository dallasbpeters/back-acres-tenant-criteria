import "server-only";
import { type AnyColumn, sql } from "drizzle-orm";
import { removedRecords } from "@/lib/db/schema";
export function notRemoved(id: AnyColumn) {
  return sql`not exists (select 1 from ${removedRecords} where ${removedRecords.entityId} = ${id})`;
}
