CREATE TABLE "book" (
	"id" text PRIMARY KEY NOT NULL,
	"isbn" text,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"publisher" text,
	"edition" text,
	"category" text DEFAULT 'GENERAL' NOT NULL,
	"description" text,
	"cover_image_url" text,
	"total_copies" integer DEFAULT 0 NOT NULL,
	"available_copies" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_copy" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"accession_number" text NOT NULL,
	"condition" text DEFAULT 'NEW' NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"location" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "book_copy_accession_number_unique" UNIQUE("accession_number")
);
--> statement-breakpoint
CREATE TABLE "book_issuance" (
	"id" text PRIMARY KEY NOT NULL,
	"book_copy_id" text NOT NULL,
	"child_id" text NOT NULL,
	"issued_at" timestamp NOT NULL,
	"due_date" timestamp NOT NULL,
	"returned_at" timestamp,
	"status" text DEFAULT 'ISSUED' NOT NULL,
	"reissue_count" integer DEFAULT 0 NOT NULL,
	"issued_by" text,
	"return_confirmed_by" text,
	"fine_amount" double precision DEFAULT 0 NOT NULL,
	"fine_deducted" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"type" text NOT NULL,
	"value" double precision NOT NULL,
	"reason" text,
	"mode" text DEFAULT 'MANUAL' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"updated_by" text,
	CONSTRAINT "library_setting_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "book_copy" ADD CONSTRAINT "book_copy_book_id_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_issuance" ADD CONSTRAINT "book_issuance_book_copy_id_book_copy_id_fk" FOREIGN KEY ("book_copy_id") REFERENCES "public"."book_copy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_issuance" ADD CONSTRAINT "book_issuance_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_issuance" ADD CONSTRAINT "book_issuance_return_confirmed_by_user_id_fk" FOREIGN KEY ("return_confirmed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount" ADD CONSTRAINT "discount_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_setting" ADD CONSTRAINT "library_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;