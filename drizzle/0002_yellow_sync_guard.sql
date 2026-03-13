CREATE TABLE "offline_sync_action" (
	"id" text PRIMARY KEY NOT NULL,
	"action_id" text NOT NULL,
	"action_type" text NOT NULL,
	"status" text DEFAULT 'SUCCESS' NOT NULL,
	"response" text,
	"processed_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "offline_sync_action_action_id_unique" UNIQUE("action_id")
);