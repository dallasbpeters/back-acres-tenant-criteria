CREATE TABLE "rental_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"criteria_snapshot" text NOT NULL,
	"criteria_version" text NOT NULL,
	"property_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"payer_name" text NOT NULL,
	"payer_email" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_date" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"stripe_session_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_invoices_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "lease_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"parent_id" uuid,
	"tenant_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lease_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"resident_link_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "management_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "resident_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"property_id" uuid NOT NULL,
	"resident_name" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rental_applications" ADD CONSTRAINT "rental_applications_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_invoices" ADD CONSTRAINT "rental_invoices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_drafts" ADD CONSTRAINT "lease_drafts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_drafts" ADD CONSTRAINT "lease_drafts_template_id_lease_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."lease_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_resident_link_id_resident_links_id_fk" FOREIGN KEY ("resident_link_id") REFERENCES "public"."resident_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_links" ADD CONSTRAINT "resident_links_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;