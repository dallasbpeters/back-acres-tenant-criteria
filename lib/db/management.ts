import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
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
export const invoices = pgTable("rental_invoices", {
  mode: text("mode").notNull().default("test"),
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
  body: text("body").notNull(),
  createdAt: createdAt(),
});
