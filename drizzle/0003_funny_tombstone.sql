CREATE TABLE "rent_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"payer_name" text NOT NULL,
	"payer_email" text NOT NULL,
	"monthly_cents" integer NOT NULL,
	"first_date" text NOT NULL,
	"installments" integer NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"stripe_customer_id" text,
	"stripe_schedule_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_schedules_stripe_schedule_id_unique" UNIQUE("stripe_schedule_id")
);
--> statement-breakpoint
ALTER TABLE "rental_invoices" ADD COLUMN "stripe_invoice_id" text;--> statement-breakpoint
ALTER TABLE "rental_invoices" ADD COLUMN "hosted_invoice_url" text;--> statement-breakpoint
ALTER TABLE "rental_invoices" ADD COLUMN "billing_schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "rent_schedules" ADD CONSTRAINT "rent_schedules_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_rent_schedule" ON "rent_schedules" USING btree ("property_id","payer_email","mode") WHERE "rent_schedules"."status" in ('creating','not_started','active','needs_review');--> statement-breakpoint
ALTER TABLE "rental_invoices" ADD CONSTRAINT "rental_invoices_billing_schedule_id_rent_schedules_id_fk" FOREIGN KEY ("billing_schedule_id") REFERENCES "public"."rent_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_invoices" ADD CONSTRAINT "rental_invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id");