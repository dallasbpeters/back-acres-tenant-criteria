ALTER TABLE "lease_signers" ADD COLUMN "claim_hash" text;--> statement-breakpoint
ALTER TABLE "lease_signers" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lease_signers" ADD COLUMN "clerk_user_id" text;