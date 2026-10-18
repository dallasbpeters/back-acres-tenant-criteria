import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { LeaseValues } from "../management/leases";
import type { PropertyInput, ApplicationInput } from "../management/model";
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const properties = pgTable("properties", {
  id: uuid("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  data: jsonb("data").$type<PropertyInput>().notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: createdAt(),
});
export const applications = pgTable("rental_applications", {
  id: uuid("id").primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  data: jsonb("data").$type<ApplicationInput>().notNull(),
  criteriaSnapshot: text("criteria_snapshot").notNull(),
  criteriaVersion: text("criteria_version").notNull(),
  propertySnapshot: jsonb("property_snapshot").$type<PropertyInput>().notNull(),
  status: text("status").notNull().default("received"),
  createdAt: createdAt(),
});
export const residentLinks = pgTable("resident_links", {
  id: uuid("id").primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  residentName: text("resident_name").notNull(),
  revoked: boolean("revoked").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});
export const maintenanceRequests = pgTable("maintenance_requests", {
  id: uuid("id").primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  residentLinkId: uuid("resident_link_id")
    .notNull()
    .references(() => residentLinks.id),
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
  status: text("status").notNull().default("received"),
  createdAt: createdAt(),
});
export const rentSchedules = pgTable(
  "rent_schedules",
  {
    id: uuid("id").primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    payerName: text("payer_name").notNull(),
    payerEmail: text("payer_email").notNull(),
    monthlyCents: integer("monthly_cents").notNull(),
    firstDate: text("first_date").notNull(),
    installments: integer("installments").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("creating"),
    collection: text("collection").notNull().default("invoice"),
    setupSessionId: text("setup_session_id"),
    setupIntentId: text("setup_intent_id").unique(),
    stripePaymentMethodId: text("stripe_payment_method_id"),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    authorizationText: text("authorization_text"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeScheduleId: text("stripe_schedule_id").unique(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("one_active_rent_schedule")
      .on(t.propertyId, t.payerEmail, t.mode)
      .where(
        sql`${t.status} in ('creating','not_started','active','needs_review','awaiting_authorization','creating_checkout','awaiting_verification','activating','canceling')`,
      ),
  ],
);
export const invoices = pgTable("rental_invoices", {
  mode: text("mode").notNull().default("test"),
  stripeInvoiceId: text("stripe_invoice_id").unique(),
  hostedInvoiceUrl: text("hosted_invoice_url"),
  billingScheduleId: uuid("billing_schedule_id").references(
    () => rentSchedules.id,
  ),
  id: uuid("id").primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  payerName: text("payer_name").notNull(),
  payerEmail: text("payer_email").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("open"),
  stripeSessionId: text("stripe_session_id").unique(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: createdAt(),
});
export const intakeLimits = pgTable("intake_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const managementEvents = pgTable("management_events", {
  id: uuid("id").primaryKey(),
  entityId: uuid("entity_id").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  detail: jsonb("detail").notNull(),
  createdAt: createdAt(),
});
export const leaseTemplates = pgTable("lease_templates", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});
export const leaseDrafts = pgTable("lease_drafts", {
  id: uuid("id").primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  templateId: uuid("template_id")
    .notNull()
    .references(() => leaseTemplates.id),
  parentId: uuid("parent_id"),
  tenantName: text("tenant_name").notNull(),
  values: jsonb("values").$type<LeaseValues>(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const listingPhotos = pgTable("listing_photos", {
  id: uuid("id").primaryKey(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  blobPath: text("blob_path").notNull(),
  caption: text("caption").notNull().default(""),
  position: integer("position").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  createdAt: createdAt(),
});
export const listingPublications = pgTable(
  "listing_publications",
  {
    id: uuid("id").primaryKey(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    contentDigest: text("content_digest").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("listing_provider_unique").on(t.propertyId, t.provider)],
);
