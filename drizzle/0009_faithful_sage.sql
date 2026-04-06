CREATE TABLE "certe_subscription_penalty_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"child_id" text NOT NULL,
	"penalties_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "certe_subscription_penalty_usage_sub_child_unique" UNIQUE("subscription_id","child_id")
);
--> statement-breakpoint
CREATE TABLE "messaging_log" (
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
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_messaging_preference" (
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
	CONSTRAINT "parent_messaging_preference_parent_id_unique" UNIQUE("parent_id")
);
--> statement-breakpoint
CREATE TABLE "temporary_rfid_access" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"temporary_rfid_card_id" text NOT NULL,
	"access_type" text DEFAULT 'STUDENT_TEMP' NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_until" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_by_operator_id" text,
	"notes" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "temporary_rfid_access_temporary_rfid_card_id_unique" UNIQUE("temporary_rfid_card_id")
);
--> statement-breakpoint
ALTER TABLE "pre_order_item" ADD COLUMN "break_name" text;--> statement-breakpoint
ALTER TABLE "pre_order_item" ADD COLUMN "last_fulfilled_on" text;--> statement-breakpoint
ALTER TABLE "certe_subscription_penalty_usage" ADD CONSTRAINT "certe_subscription_penalty_usage_subscription_id_certe_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."certe_subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certe_subscription_penalty_usage" ADD CONSTRAINT "certe_subscription_penalty_usage_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_log" ADD CONSTRAINT "messaging_log_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_log" ADD CONSTRAINT "messaging_log_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_messaging_preference" ADD CONSTRAINT "parent_messaging_preference_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_rfid_access" ADD CONSTRAINT "temporary_rfid_access_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_rfid_access" ADD CONSTRAINT "temporary_rfid_access_created_by_operator_id_user_id_fk" FOREIGN KEY ("created_by_operator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;