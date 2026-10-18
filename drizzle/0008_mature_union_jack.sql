CREATE TABLE "removed_records" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"actor" text NOT NULL,
	"removed_at" timestamp with time zone DEFAULT now() NOT NULL
);
