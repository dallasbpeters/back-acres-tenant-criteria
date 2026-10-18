import {
  pgTable,
  uuid,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Notice } from "../adverse/notice";
export const noticeVersions = pgTable(
  "adverse_notice_versions",
  {
    id: uuid("id").primaryKey(),
    documentId: uuid("document_id").notNull(),
    version: integer("version").notNull(),
    notice: jsonb("notice").$type<Notice>().notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    plainText: text("plain_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("adverse_document_version").on(t.documentId, t.version)],
);
export const noticeDeliveries = pgTable("adverse_notice_deliveries", {
  versionId: uuid("version_id")
    .primaryKey()
    .references(() => noticeVersions.id),
  status: text("status").notNull(),
  resendId: text("resend_id"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});
export * from "./management";
export * from "./signing";
