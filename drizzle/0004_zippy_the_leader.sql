CREATE TABLE "bulk_photo_upload" (
	"id" text PRIMARY KEY NOT NULL,
	"uploaded_by" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"total_files" integer NOT NULL,
	"processed_files" integer DEFAULT 0 NOT NULL,
	"failed_files" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'UPLOADED' NOT NULL,
	"current_step" text DEFAULT 'FILE_RECEIVED' NOT NULL,
	"error_message" text,
	"metadata" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_upload_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"bulk_upload_id" text NOT NULL,
	"child_id" text NOT NULL,
	"photo_url" text NOT NULL,
	"original_file_name" text,
	"file_size" integer,
	"upload_status" text DEFAULT 'PENDING' NOT NULL,
	"error_reason" text,
	"processing_started_at" timestamp,
	"processing_completed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bulk_photo_upload" ADD CONSTRAINT "bulk_photo_upload_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_upload_batch" ADD CONSTRAINT "photo_upload_batch_bulk_upload_id_bulk_photo_upload_id_fk" FOREIGN KEY ("bulk_upload_id") REFERENCES "public"."bulk_photo_upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_upload_batch" ADD CONSTRAINT "photo_upload_batch_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;