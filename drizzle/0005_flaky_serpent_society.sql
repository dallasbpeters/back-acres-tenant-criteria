DROP INDEX "one_active_rent_schedule";--> statement-breakpoint
ALTER TABLE "rent_schedules" ADD COLUMN "collection" text DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "rent_schedules" ADD COLUMN "setup_session_id" text;--> statement-breakpoint
ALTER TABLE "rent_schedules" ADD COLUMN "setup_intent_id" text;--> statement-breakpoint
ALTER TABLE "rent_schedules" ADD COLUMN "consented_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rent_schedules" ADD COLUMN "authorization_text" text;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_rent_schedule" ON "rent_schedules" USING btree ("property_id","payer_email","mode") WHERE "rent_schedules"."status" in ('creating','not_started','active','needs_review','awaiting_authorization','creating_checkout','awaiting_verification','activating','canceling');--> statement-breakpoint
ALTER TABLE "rent_schedules" ADD CONSTRAINT "rent_schedules_setup_intent_id_unique" UNIQUE("setup_intent_id");