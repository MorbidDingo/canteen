CREATE TABLE "gate_log" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"direction" text NOT NULL,
	"gate_id" text,
	"tapped_at" timestamp NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"anomaly_reason" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "child" ADD COLUMN "presence_status" text DEFAULT 'OUTSIDE' NOT NULL;--> statement-breakpoint
ALTER TABLE "child" ADD COLUMN "last_gate_tap_at" timestamp;--> statement-breakpoint
ALTER TABLE "parent_control" ADD COLUMN "blocked_book_categories" text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "parent_control" ADD COLUMN "blocked_book_authors" text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "parent_control" ADD COLUMN "blocked_book_ids" text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "parent_control" ADD COLUMN "pre_issue_book_id" text;--> statement-breakpoint
ALTER TABLE "parent_control" ADD COLUMN "pre_issue_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "parent_control" ADD COLUMN "pre_issue_declined_until" timestamp;--> statement-breakpoint
ALTER TABLE "pre_order" ADD COLUMN "mode" text DEFAULT 'ONE_DAY' NOT NULL;--> statement-breakpoint
ALTER TABLE "pre_order" ADD COLUMN "subscription_until" text;--> statement-breakpoint
ALTER TABLE "pre_order" ADD COLUMN "last_fulfilled_date" text;--> statement-breakpoint
ALTER TABLE "gate_log" ADD CONSTRAINT "gate_log_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;