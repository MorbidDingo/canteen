CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" text DEFAULT 'SCHOOL' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"approved_by_user_id" text,
	"approved_at" timestamp,
	"suspended_at" timestamp,
	"suspension_reason" text,
	"default_timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organization_approval_request" (
	"id" text PRIMARY KEY NOT NULL,
	"applicant_user_id" text NOT NULL,
	"requested_name" text NOT NULL,
	"requested_slug" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_contract" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contract_code" text NOT NULL,
	"plan_name" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"auto_suspend_on_expiry" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_device" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"device_type" text NOT NULL,
	"device_name" text DEFAULT 'Terminal' NOT NULL,
	"device_code" text NOT NULL,
	"auth_token_hash" text NOT NULL,
	"current_ip" text,
	"last_ip" text,
	"last_user_agent" text,
	"login_user_id" text,
	"created_by_user_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "organization_device_org_type_code_unique" UNIQUE("organization_id","device_type","device_code")
);
--> statement-breakpoint
CREATE TABLE "organization_device_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"device_id" text NOT NULL,
	"user_id" text NOT NULL,
	"assigned_by_user_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "organization_device_assignment_device_user_unique" UNIQUE("device_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organization_feature_entitlement" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'PLAN_DEFAULT' NOT NULL,
	"hard_locked_by_owner" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "organization_feature_entitlement_org_feature_unique" UNIQUE("organization_id","feature_key")
);
--> statement-breakpoint
CREATE TABLE "organization_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'INVITED' NOT NULL,
	"invited_by_user_id" text,
	"joined_at" timestamp,
	"suspended_at" timestamp,
	"suspension_reason" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "organization_membership_org_user_role_unique" UNIQUE("organization_id","user_id","role")
);
--> statement-breakpoint
CREATE TABLE "organization_owner_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"tier" text DEFAULT 'BASIC' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"org_limit" integer DEFAULT 1 NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"payment_method" text DEFAULT 'FREE' NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_payment_config" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text DEFAULT 'RAZORPAY' NOT NULL,
	"mode" text DEFAULT 'ORG_MANAGED' NOT NULL,
	"key_id" text,
	"key_secret_encrypted" text,
	"webhook_secret_encrypted" text,
	"settlement_owner" text DEFAULT 'ORG' NOT NULL,
	"status" text DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"last_verified_at" timestamp,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "organization_payment_config_org_provider_unique" UNIQUE("organization_id","provider")
);
--> statement-breakpoint
CREATE TABLE "organization_reactivation_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reason" text,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_user_role" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "platform_user_role_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "book_copy" DROP CONSTRAINT "book_copy_accession_number_unique";--> statement-breakpoint
ALTER TABLE "child" DROP CONSTRAINT "child_gr_number_unique";--> statement-breakpoint
ALTER TABLE "child" DROP CONSTRAINT "child_rfid_card_id_unique";--> statement-breakpoint
ALTER TABLE "temporary_rfid_access" DROP CONSTRAINT "temporary_rfid_access_temporary_rfid_card_id_unique";--> statement-breakpoint
ALTER TABLE "app_setting" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "book" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "book_copy" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "book_issuance" ADD COLUMN "device_id" text;--> statement-breakpoint
ALTER TABLE "bulk_photo_upload" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "child" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "library_setting" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "device_id" text;--> statement-breakpoint
ALTER TABLE "temporary_rfid_access" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_approval_request" ADD CONSTRAINT "organization_approval_request_applicant_user_id_user_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_approval_request" ADD CONSTRAINT "organization_approval_request_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contract" ADD CONSTRAINT "organization_contract_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_contract" ADD CONSTRAINT "organization_contract_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_device" ADD CONSTRAINT "organization_device_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_device" ADD CONSTRAINT "organization_device_login_user_id_user_id_fk" FOREIGN KEY ("login_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_device" ADD CONSTRAINT "organization_device_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_device_assignment" ADD CONSTRAINT "organization_device_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_device_assignment" ADD CONSTRAINT "organization_device_assignment_device_id_organization_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."organization_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_device_assignment" ADD CONSTRAINT "organization_device_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_device_assignment" ADD CONSTRAINT "organization_device_assignment_assigned_by_user_id_user_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_feature_entitlement" ADD CONSTRAINT "organization_feature_entitlement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_feature_entitlement" ADD CONSTRAINT "organization_feature_entitlement_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_owner_subscription" ADD CONSTRAINT "organization_owner_subscription_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_payment_config" ADD CONSTRAINT "organization_payment_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_payment_config" ADD CONSTRAINT "organization_payment_config_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_reactivation_request" ADD CONSTRAINT "organization_reactivation_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_reactivation_request" ADD CONSTRAINT "organization_reactivation_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_reactivation_request" ADD CONSTRAINT "organization_reactivation_request_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_user_role" ADD CONSTRAINT "platform_user_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_setting" ADD CONSTRAINT "app_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book" ADD CONSTRAINT "book_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_copy" ADD CONSTRAINT "book_copy_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_issuance" ADD CONSTRAINT "book_issuance_device_id_organization_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."organization_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_photo_upload" ADD CONSTRAINT "bulk_photo_upload_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child" ADD CONSTRAINT "child_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_setting" ADD CONSTRAINT "library_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_device_id_organization_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."organization_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temporary_rfid_access" ADD CONSTRAINT "temporary_rfid_access_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_copy" ADD CONSTRAINT "book_copy_org_accession_number_unique" UNIQUE("organization_id","accession_number");--> statement-breakpoint
ALTER TABLE "child" ADD CONSTRAINT "child_org_gr_number_unique" UNIQUE("organization_id","gr_number");--> statement-breakpoint
ALTER TABLE "child" ADD CONSTRAINT "child_org_rfid_card_id_unique" UNIQUE("organization_id","rfid_card_id");--> statement-breakpoint
ALTER TABLE "temporary_rfid_access" ADD CONSTRAINT "temporary_rfid_access_org_card_id_unique" UNIQUE("organization_id","temporary_rfid_card_id");