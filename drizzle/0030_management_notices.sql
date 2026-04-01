CREATE TABLE "management_notice" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"target_type" text NOT NULL,
	"target_class" text,
	"target_user_ids" text,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notice_acknowledgment" (
	"id" text PRIMARY KEY NOT NULL,
	"notice_id" text NOT NULL,
	"user_id" text NOT NULL,
	"acknowledged_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "management_notice" ADD CONSTRAINT "management_notice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "management_notice" ADD CONSTRAINT "management_notice_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notice_acknowledgment" ADD CONSTRAINT "notice_acknowledgment_notice_id_management_notice_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."management_notice"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notice_acknowledgment" ADD CONSTRAINT "notice_acknowledgment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notice_acknowledgment" ADD CONSTRAINT "notice_ack_notice_user_unique" UNIQUE("notice_id","user_id");
