CREATE TABLE "brand_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_png" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lease_packets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"status" text DEFAULT 'awaiting' NOT NULL,
	"body" text NOT NULL,
	"base_pdf" text NOT NULL,
	"document_hash" text NOT NULL,
	"brand_name" text NOT NULL,
	"final_pdf" text,
	"final_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lease_signers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"packet_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"code_attempts" integer DEFAULT 0 NOT NULL,
	"session_hash" text,
	"session_expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"pdf_viewed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"signature_png" text,
	"signature_hash" text,
	"consent" text,
	"consent_version" text,
	"signed_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"evidence" text,
	"evidence_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lease_signers_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "lease_packets" ADD CONSTRAINT "lease_packets_draft_id_lease_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."lease_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_signers" ADD CONSTRAINT "lease_signers_packet_id_lease_packets_id_fk" FOREIGN KEY ("packet_id") REFERENCES "public"."lease_packets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_lease_family" ON "lease_packets" USING btree ("family_id") WHERE "lease_packets"."status" = 'awaiting';--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_lease_packet" ON "lease_packets" USING btree ("draft_id") WHERE "lease_packets"."status" <> 'voided';