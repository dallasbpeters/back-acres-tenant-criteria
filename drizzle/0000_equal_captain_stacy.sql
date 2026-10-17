CREATE TABLE "adverse_notice_deliveries" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"resend_id" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "adverse_notice_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"notice" jsonb NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"plain_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adverse_notice_deliveries" ADD CONSTRAINT "adverse_notice_deliveries_version_id_adverse_notice_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."adverse_notice_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "adverse_document_version" ON "adverse_notice_versions" USING btree ("document_id","version");