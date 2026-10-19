ALTER TABLE "lease_signers" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lease_signers" ADD COLUMN "phone" text;