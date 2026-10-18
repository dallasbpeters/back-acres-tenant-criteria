import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { leaseDrafts } from "./management";
export const brandVersions = pgTable("brand_versions", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  logoPng: text("logo_png"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const leasePackets = pgTable(
  "lease_packets",
  {
    id: uuid("id").primaryKey(),
    familyId: uuid("family_id").notNull(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => leaseDrafts.id),
    status: text("status").notNull().default("awaiting"),
    body: text("body").notNull(),
    basePdf: text("base_pdf").notNull(),
    documentHash: text("document_hash").notNull(),
    brandName: text("brand_name").notNull(),
    finalPdf: text("final_pdf"),
    finalHash: text("final_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("one_pending_lease_family")
      .on(t.familyId)
      .where(sql`${t.status} = 'awaiting'`),
    uniqueIndex("one_current_lease_packet")
      .on(t.draftId)
      .where(sql`${t.status} <> 'voided'`),
  ],
);
export const leaseSigners = pgTable("lease_signers", {
  id: uuid("id").primaryKey(),
  packetId: uuid("packet_id")
    .notNull()
    .references(() => leasePackets.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  codeHash: text("code_hash"),
  codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }),
  codeAttempts: integer("code_attempts").notNull().default(0),
  sessionHash: text("session_hash"),
  sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  pdfViewedAt: timestamp("pdf_viewed_at", { withTimezone: true }),
  declinedAt: timestamp("declined_at", { withTimezone: true }),
  signaturePng: text("signature_png"),
  signatureHash: text("signature_hash"),
  consent: text("consent"),
  consentVersion: text("consent_version"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  ip: text("ip"),
  userAgent: text("user_agent"),
  evidence: text("evidence"),
  evidenceHash: text("evidence_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
