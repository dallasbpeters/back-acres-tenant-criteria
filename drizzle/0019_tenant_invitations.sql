CREATE TABLE "tenant_invitations" (
	"accepted_at" timestamp with time zone,
	"actor" text NOT NULL,
	"clerk_invitation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"name" text NOT NULL,
	"property_id" uuid NOT NULL,
	"schedule_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tenant_access_id" uuid
);
--> statement-breakpoint
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_tenant_access_id_tenant_access_id_fk" FOREIGN KEY ("tenant_access_id") REFERENCES "public"."tenant_access"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_invitation" ON "tenant_invitations" USING btree ("property_id","email") WHERE "tenant_invitations"."status" = 'pending';