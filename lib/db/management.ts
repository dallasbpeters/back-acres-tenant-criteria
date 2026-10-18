import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { LeaseValues } from "../management/leases";
import type { ApplicationInput, PropertyInput } from "../management/model";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const properties = pgTable("properties", {
  createdAt: createdAt(),
  data: jsonb("data").$type<PropertyInput>().notNull(),
  id: uuid("id").primaryKey(),
  leaseDefaults: jsonb("lease_defaults").$type<LeaseValues>(),
  revision: integer("revision").notNull().default(1),
  slug: text("slug").unique().notNull(),
});
export const applications = pgTable("rental_applications", {
  createdAt: createdAt(),
  criteriaSnapshot: text("criteria_snapshot").notNull(),
  criteriaVersion: text("criteria_version").notNull(),
  data: jsonb("data").$type<ApplicationInput>().notNull(),
  id: uuid("id").primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  propertySnapshot: jsonb("property_snapshot").$type<PropertyInput>().notNull(),
  status: text("status").notNull().default("received"),
});
export const residentLinks = pgTable("resident_links", {
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  id: uuid("id").primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  residentName: text("resident_name").notNull(),
  revoked: boolean("revoked").notNull().default(false),
});
export const maintenanceRequests = pgTable("maintenance_requests", {
  createdAt: createdAt(),
  data: jsonb("data")
    .$type<{
      name: string;
      email: string;
      phone: string;
      subject: string;
      description: string;
      priority: "routine" | "urgent";
      accessNotes: string;
    }>()
    .notNull(),
  id: uuid("id").primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  residentLinkId: uuid("resident_link_id")
    .notNull()
    .references(() => residentLinks.id),
  status: text("status").notNull().default("received"),
});
export const rentSchedules = pgTable(
  "rent_schedules",
  {
    authorizationText: text("authorization_text"),
    collection: text("collection").notNull().default("invoice"),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    createdAt: createdAt(),
    firstDate: text("first_date").notNull(),
    id: uuid("id").primaryKey(),
    installments: integer("installments").notNull(),
    mode: text("mode").notNull(),
    monthlyCents: integer("monthly_cents").notNull(),
    payerEmail: text("payer_email").notNull(),
    payerName: text("payer_name").notNull(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    setupIntentId: text("setup_intent_id").unique(),
    setupSessionId: text("setup_session_id"),
    status: text("status").notNull().default("creating"),
    stripeCustomerId: text("stripe_customer_id"),
    stripePaymentMethodId: text("stripe_payment_method_id"),
    stripeScheduleId: text("stripe_schedule_id").unique(),
  },
  (t) => [
    uniqueIndex("one_active_rent_schedule")
      .on(t.propertyId, t.payerEmail, t.mode)
      .where(
        sql`${t.status} in ('creating','not_started','active','needs_review','awaiting_authorization','creating_checkout','awaiting_verification','activating','canceling')`
      ),
  ]
);
export const invoices = pgTable("rental_invoices", {
  amountCents: integer("amount_cents").notNull(),
  billingScheduleId: uuid("billing_schedule_id").references(
    () => rentSchedules.id
  ),
  category: text("category").notNull(),
  createdAt: createdAt(),
  description: text("description").notNull(),
  dueDate: text("due_date").notNull(),
  hostedInvoiceUrl: text("hosted_invoice_url"),
  id: uuid("id").primaryKey(),
  mode: text("mode").notNull().default("test"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  payerEmail: text("payer_email").notNull(),
  payerName: text("payer_name").notNull(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  status: text("status").notNull().default("open"),
  stripeInvoiceId: text("stripe_invoice_id").unique(),
  stripeSessionId: text("stripe_session_id").unique(),
});
export const intakeLimits = pgTable("intake_limits", {
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  key: text("key").primaryKey(),
});
export const managementEvents = pgTable("management_events", {
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  createdAt: createdAt(),
  detail: jsonb("detail").notNull(),
  entityId: uuid("entity_id").notNull(),
  id: uuid("id").primaryKey(),
});
export const leaseTemplates = pgTable("lease_templates", {
  body: text("body").notNull(),
  createdAt: createdAt(),
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
});
export const leaseDrafts = pgTable("lease_drafts", {
  body: text("body").notNull(),
  createdAt: createdAt(),
  document: jsonb("document").$type<import("../leases/document").LeaseNode>(),
  id: uuid("id").primaryKey(),
  parentId: uuid("parent_id"),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  templateId: uuid("template_id")
    .notNull()
    .references(() => leaseTemplates.id),
  tenantName: text("tenant_name").notNull(),
  values: jsonb("values").$type<LeaseValues>(),
});

export const listingPhotos = pgTable("listing_photos", {
  archived: boolean("archived").notNull().default(false),
  blobPath: text("blob_path").notNull(),
  caption: text("caption").notNull().default(""),
  createdAt: createdAt(),
  id: uuid("id").primaryKey(),
  position: integer("position").notNull().default(0),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
});
export const listingPublications = pgTable(
  "listing_publications",
  {
    contentDigest: text("content_digest").notNull(),
    id: uuid("id").primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("listing_provider_unique").on(t.propertyId, t.provider)]
);

// Reversible workspace removal. Keep source records and their references intact.
export const removedRecords = pgTable("removed_records", {
  actor: text("actor").notNull(),
  entityId: uuid("entity_id").primaryKey(),
  groupId: uuid("group_id").notNull(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  removedAt: timestamp("removed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
