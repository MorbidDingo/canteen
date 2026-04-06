CREATE TABLE "content_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "content_tag_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "content_post_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "content_post_tag_unique" UNIQUE("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "content_group" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "content_group_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "content_group_member" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "content_group_member_unique" UNIQUE("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "content_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "content_permission_org_user_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "content_post" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"due_at" timestamp,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_post_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"storage_backend" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_post_audience" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"audience_type" text NOT NULL,
	"class_name" text,
	"section" text,
	"user_id" text,
	"group_id" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "content_post_audience_post_target_unique" UNIQUE("post_id","audience_type","class_name","section","user_id","group_id"),
	CONSTRAINT "content_post_audience_shape_check" CHECK ((
	  ("content_post_audience"."audience_type" = 'ALL_ORG' AND "content_post_audience"."class_name" IS NULL AND "content_post_audience"."section" IS NULL AND "content_post_audience"."user_id" IS NULL AND "content_post_audience"."group_id" IS NULL)
	  OR ("content_post_audience"."audience_type" = 'CLASS' AND "content_post_audience"."class_name" IS NOT NULL AND "content_post_audience"."section" IS NULL AND "content_post_audience"."user_id" IS NULL AND "content_post_audience"."group_id" IS NULL)
	  OR ("content_post_audience"."audience_type" = 'SECTION' AND "content_post_audience"."class_name" IS NOT NULL AND "content_post_audience"."section" IS NOT NULL AND "content_post_audience"."user_id" IS NULL AND "content_post_audience"."group_id" IS NULL)
	  OR ("content_post_audience"."audience_type" = 'USER' AND "content_post_audience"."class_name" IS NULL AND "content_post_audience"."section" IS NULL AND "content_post_audience"."user_id" IS NOT NULL AND "content_post_audience"."group_id" IS NULL)
	  OR ("content_post_audience"."audience_type" = 'GROUP' AND "content_post_audience"."class_name" IS NULL AND "content_post_audience"."section" IS NULL AND "content_post_audience"."user_id" IS NULL AND "content_post_audience"."group_id" IS NOT NULL)
	))
);
--> statement-breakpoint
CREATE TABLE "content_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"text_content" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "content_submission_post_submitter_unique" UNIQUE("post_id","submitted_by_user_id")
);
--> statement-breakpoint
CREATE TABLE "content_submission_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"storage_backend" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_read" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "content_read_post_user_unique" UNIQUE("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "content_permission" ADD CONSTRAINT "content_permission_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_permission" ADD CONSTRAINT "content_permission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_permission" ADD CONSTRAINT "content_permission_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_post" ADD CONSTRAINT "content_post_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_post" ADD CONSTRAINT "content_post_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_post_attachment" ADD CONSTRAINT "content_post_attachment_post_id_content_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."content_post"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_post_audience" ADD CONSTRAINT "content_post_audience_post_id_content_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."content_post"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_post_audience" ADD CONSTRAINT "content_post_audience_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_post_audience" ADD CONSTRAINT "content_post_audience_group_id_content_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."content_group"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_submission" ADD CONSTRAINT "content_submission_post_id_content_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."content_post"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_submission" ADD CONSTRAINT "content_submission_submitted_by_user_id_user_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_submission_attachment" ADD CONSTRAINT "content_submission_attachment_submission_id_content_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."content_submission"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_read" ADD CONSTRAINT "content_read_post_id_content_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."content_post"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_read" ADD CONSTRAINT "content_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_tag" ADD CONSTRAINT "content_tag_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_tag" ADD CONSTRAINT "content_tag_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_post_tag" ADD CONSTRAINT "content_post_tag_post_id_content_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."content_post"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_post_tag" ADD CONSTRAINT "content_post_tag_tag_id_content_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."content_tag"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_group" ADD CONSTRAINT "content_group_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_group" ADD CONSTRAINT "content_group_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_group_member" ADD CONSTRAINT "content_group_member_group_id_content_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."content_group"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_group_member" ADD CONSTRAINT "content_group_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;