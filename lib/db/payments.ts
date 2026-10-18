import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { invoices, rentSchedules } from "./management";

// Written by the database in the same transaction as each invoice change.
export const paymentHistory = pgTable(
  "payment_history",
  {
    amountCents: integer("amount_cents").notNull(),
    id: uuid("id").primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    mode: text("mode").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    previousStatus: text("previous_status"),
    refundedCents: integer("refunded_cents").notNull(),
    source: text("source").notNull().default("database_change"),
    status: text("status").notNull(),
    stripeInvoiceId: text("stripe_invoice_id"),
    stripeSessionId: text("stripe_session_id"),
  },
  (t) => [index("payment_history_invoice_time").on(t.invoiceId, t.observedAt)]
);

export const authorizationReceipts = pgTable("authorization_receipts", {
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  authorizationText: text("authorization_text").notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
  id: text("id").primaryKey(),
  payerName: text("payer_name").notNull(),
  recipient: text("recipient").notNull(),
  resendId: text("resend_id"),
  scheduleId: uuid("schedule_id")
    .notNull()
    .references(() => rentSchedules.id),
});

export const paymentRecoveryRuns = pgTable("payment_recovery_runs", {
  acceptedReceipts: integer("accepted_receipts"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  id: uuid("id").primaryKey(),
  reconciled: integer("reconciled"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  status: text("status").notNull(),
});
