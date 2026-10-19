import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { properties, residentLinks } from "./management";

// Owner-approved, explicit record grants. Changing a Clerk email never changes these grants.
export const tenantAccess = pgTable(
  "tenant_access",
  {
    clerkUserId: text("clerk_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey(),
    invoiceIds: jsonb("invoice_ids").$type<string[]>().notNull().default([]),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    residentLinkId: uuid("resident_link_id")
      .notNull()
      .unique()
      .references(() => residentLinks.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    scheduleIds: jsonb("schedule_ids").$type<string[]>().notNull().default([]),
  },
  (t) => [
    uniqueIndex("tenant_property_account").on(t.propertyId, t.clerkUserId),
  ]
);

// Renter-uploaded insurance proof. The file lives in private Blob storage;
// these rows hold the policy details and the owner's review.
export const insuranceDocuments = pgTable(
  "insurance_documents",
  {
    blobPath: text("blob_path").notNull(),
    carrier: text("carrier").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsOn: date("ends_on").notNull(),
    fileName: text("file_name").notNull(),
    fileSha256: text("file_sha256").notNull(),
    id: uuid("id").primaryKey(),
    policyNumber: text("policy_number").notNull(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewNote: text("review_note").notNull().default(""),
    size: integer("size").notNull(),
    startsOn: date("starts_on").notNull(),
    // pending | accepted | rejected
    status: text("status").notNull().default("pending"),
    tenantAccessId: uuid("tenant_access_id")
      .notNull()
      .references(() => tenantAccess.id),
  },
  (t) => [index("insurance_by_access").on(t.tenantAccessId, t.createdAt)]
);
