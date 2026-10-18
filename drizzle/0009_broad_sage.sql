ALTER TABLE "lease_drafts" ADD COLUMN "document" jsonb;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "lease_defaults" jsonb;