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
ALTER TABLE "certe_subscription_penalty_usage" ADD CONSTRAINT "certe_subscription_penalty_usage_subscription_id_certe_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."certe_subscription"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "certe_subscription_penalty_usage" ADD CONSTRAINT "certe_subscription_penalty_usage_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;

