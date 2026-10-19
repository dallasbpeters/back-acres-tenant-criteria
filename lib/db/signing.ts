import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { BrandColors } from "@/lib/brand-colors";
import { leaseDrafts } from "./management";
export const brandVersions = pgTable("brand_versions", {
  // Light and dark OKLCH palettes; null keeps the application defaults.
  colors: jsonb("colors").$type<BrandColors>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  id: uuid("id").primaryKey(),
  logoPng: text("logo_png"),
  name: text("name").notNull(),
});
export const leasePackets = pgTable(
  "lease_packets",
  {
    basePdf: text("base_pdf").notNull(),
    body: text("body").notNull(),
    brandName: text("brand_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    documentHash: text("document_hash").notNull(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => leaseDrafts.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    familyId: uuid("family_id").notNull(),
    finalHash: text("final_hash"),
    finalPdf: text("final_pdf"),
    id: uuid("id").primaryKey(),
    status: text("status").notNull().default("awaiting"),
  },
  (t) => [
    uniqueIndex("one_pending_lease_family")
      .on(t.familyId)
      .where(sql`${t.status} = 'awaiting'`),
    uniqueIndex("one_current_lease_packet")
      .on(t.draftId)
      .where(sql`${t.status} <> 'voided'`),
  ]
);
export const leaseSigners = pgTable("lease_signers", {
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  /** Hash of a one-time code that attaches a new portal account after signing. */
  claimHash: text("claim_hash"),
  /** The portal account that claimed this signer, whatever its email. */
  clerkUserId: text("clerk_user_id"),
  codeAttempts: integer("code_attempts").notNull().default(0),
  codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }),
  codeHash: text("code_hash"),
  consent: text("consent"),
  consentVersion: text("consent_version"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  declinedAt: timestamp("declined_at", { withTimezone: true }),
  /** Null for a signer reached by phone; then the owner texts the link. */
  email: text("email"),
  evidence: text("evidence"),
  evidenceHash: text("evidence_hash"),
  id: uuid("id").primaryKey(),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  ip: text("ip"),
  name: text("name").notNull(),
  packetId: uuid("packet_id")
    .notNull()
    .references(() => leasePackets.id),
  pdfViewedAt: timestamp("pdf_viewed_at", { withTimezone: true }),
  /** Mobile number in +1XXXXXXXXXX form, for texting the signing link. */
  phone: text("phone"),
  role: text("role").notNull(),
  sessionExpiresAt: timestamp("session_expires_at", { withTimezone: true }),
  sessionHash: text("session_hash"),
  signatureHash: text("signature_hash"),
  signaturePng: text("signature_png"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  tokenHash: text("token_hash").notNull().unique(),
  userAgent: text("user_agent"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});
