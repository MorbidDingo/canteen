CREATE TABLE "app_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"updated_by" text,
	CONSTRAINT "app_setting_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "certe_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"plan" text DEFAULT 'MONTHLY' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"amount" double precision DEFAULT 129 NOT NULL,
	"payment_method" text NOT NULL,
	"razorpay_payment_id" text,
	"wallet_overdraft_used" double precision DEFAULT 0 NOT NULL,
	"library_penalties_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text NOT NULL,
	"child_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"metadata" text,
	"read_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "subscribable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certe_subscription" ADD CONSTRAINT "certe_subscription_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_notification" ADD CONSTRAINT "parent_notification_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_notification" ADD CONSTRAINT "parent_notification_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;