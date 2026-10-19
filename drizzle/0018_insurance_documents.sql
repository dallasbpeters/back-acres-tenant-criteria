CREATE TABLE "insurance_documents" (
	"blob_path" text NOT NULL,
	"carrier" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_on" date NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_number" text NOT NULL,
	"property_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"review_note" text DEFAULT '' NOT NULL,
	"size" integer NOT NULL,
	"starts_on" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tenant_access_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insurance_documents" ADD CONSTRAINT "insurance_documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_documents" ADD CONSTRAINT "insurance_documents_tenant_access_id_tenant_access_id_fk" FOREIGN KEY ("tenant_access_id") REFERENCES "public"."tenant_access"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insurance_by_access" ON "insurance_documents" USING btree ("tenant_access_id","created_at");