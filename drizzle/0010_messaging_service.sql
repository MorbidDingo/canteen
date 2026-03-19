CREATE TABLE IF NOT EXISTS "messaging_log" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"child_id" text,
	"phone_number" text NOT NULL,
	"type" text NOT NULL,
	"notification_type" text NOT NULL,
	"message_content" text NOT NULL,
	"service_response" text,
	"sent_at" timestamp NOT NULL,
	"delivered_at" timestamp,
	"failure_reason" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "messaging_log_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "user"("id") ON DELETE cascade,
	CONSTRAINT "messaging_log_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "child"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parent_messaging_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"phone_number" text,
	"preferred_channel" text DEFAULT 'BOTH' NOT NULL,
	"fallback_enabled" boolean DEFAULT true NOT NULL,
	"gate_notifications_enabled" boolean DEFAULT true NOT NULL,
	"order_notifications_enabled" boolean DEFAULT true NOT NULL,
	"spending_notifications_enabled" boolean DEFAULT true NOT NULL,
	"card_notifications_enabled" boolean DEFAULT true NOT NULL,
	"blocked_notifications_enabled" boolean DEFAULT true NOT NULL,
	"consent_given_at" timestamp,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "parent_messaging_preference_parent_id_unique" UNIQUE("parent_id"),
	CONSTRAINT "parent_messaging_preference_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messaging_log_parent_id_idx" ON "messaging_log" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messaging_log_child_id_idx" ON "messaging_log" ("child_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messaging_log_type_idx" ON "messaging_log" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messaging_log_created_at_idx" ON "messaging_log" ("created_at");
