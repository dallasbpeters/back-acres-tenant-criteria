CREATE TABLE "payment_recovery_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"reconciled" integer,
	"accepted_receipts" integer
);
--> statement-breakpoint
CREATE INDEX "payment_history_invoice_time" ON "payment_history" USING btree ("invoice_id","observed_at");