import {
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
