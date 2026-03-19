CREATE TABLE IF NOT EXISTS "organization_owner_subscription" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_user_id" text NOT NULL,
  "tier" text NOT NULL DEFAULT 'BASIC',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "org_limit" integer NOT NULL DEFAULT 1,
  "amount" double precision NOT NULL DEFAULT 0,
  "payment_method" text NOT NULL DEFAULT 'FREE',
  "razorpay_order_id" text,
  "razorpay_payment_id" text,
  "starts_at" timestamp NOT NULL DEFAULT now(),
  "ends_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "organization_owner_subscription"
  ADD CONSTRAINT "organization_owner_subscription_owner_user_id_user_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "organization_owner_subscription_owner_idx"
  ON "organization_owner_subscription" ("owner_user_id");

CREATE INDEX IF NOT EXISTS "organization_owner_subscription_status_idx"
  ON "organization_owner_subscription" ("status");
