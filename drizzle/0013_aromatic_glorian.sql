CREATE TABLE "authorization_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"payer_name" text NOT NULL,
	"authorization_text" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"resend_id" text
);
--> statement-breakpoint
CREATE TABLE "payment_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"previous_status" text,
	"amount_cents" integer NOT NULL,
	"refunded_cents" integer NOT NULL,
	"paid_at" timestamp with time zone,
	"stripe_invoice_id" text,
	"stripe_session_id" text,
	"mode" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rental_invoices" ADD COLUMN "refunded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "authorization_receipts" ADD CONSTRAINT "authorization_receipts_schedule_id_rent_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."rent_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_history" ADD CONSTRAINT "payment_history_invoice_id_rental_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."rental_invoices"("id") ON DELETE no action ON UPDATE no action;