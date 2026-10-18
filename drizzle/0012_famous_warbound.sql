CREATE TABLE "tenant_access" (
	"clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"property_id" uuid NOT NULL,
	"resident_link_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"schedule_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "tenant_access_resident_link_id_unique" UNIQUE("resident_link_id")
);
--> statement-breakpoint
ALTER TABLE "tenant_access" ADD CONSTRAINT "tenant_access_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_access" ADD CONSTRAINT "tenant_access_resident_link_id_resident_links_id_fk" FOREIGN KEY ("resident_link_id") REFERENCES "public"."resident_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_property_account" ON "tenant_access" USING btree ("property_id","clerk_user_id");