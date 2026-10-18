import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Notice } from "../adverse/notice";
export const noticeVersions = pgTable(
  "adverse_notice_versions",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    documentId: uuid("document_id").notNull(),
    html: text("html").notNull(),
    id: uuid("id").primaryKey(),
    notice: jsonb("notice").$type<Notice>().notNull(),
    plainText: text("plain_text").notNull(),
    subject: text("subject").notNull(),
    version: integer("version").notNull(),
  },
  (t) => [uniqueIndex("adverse_document_version").on(t.documentId, t.version)]
);
export const noticeDeliveries = pgTable("adverse_notice_deliveries", {
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  attemptedAt: timestamp("attempted_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  resendId: text("resend_id"),
  status: text("status").notNull(),
  versionId: uuid("version_id")
    .primaryKey()
    .references(() => noticeVersions.id),
});
// biome-ignore lint/performance/noBarrelFile: This server-only schema assembly is the canonical Drizzle migration and relationship boundary.
export * from "./management";
export * from "./payments";
export * from "./signing";
export * from "./tenants";
