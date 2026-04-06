ALTER TABLE "order"
ADD COLUMN IF NOT EXISTS "platform_fee" double precision DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "settlement_account" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "account_type" text NOT NULL CHECK ("account_type" IN ('CANTEEN_ADMIN', 'MANAGEMENT')),
  "label" text NOT NULL,
  "method" text NOT NULL CHECK ("method" IN ('BANK_ACCOUNT', 'UPI')),
  "bank_account_number" text,
  "bank_ifsc" text,
  "bank_account_holder_name" text,
  "upi_vpa" text,
  "razorpay_contact_id" text,
  "razorpay_fund_account_id" text,
  "status" text NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK ("status" IN ('ACTIVE', 'BLOCKED', 'PENDING_VERIFICATION')),
  "blocked_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "blocked_at" timestamp,
  "block_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "settlement_account_org_user_method_details_unique"
    UNIQUE ("organization_id", "user_id", "method", "bank_account_number", "bank_ifsc", "upi_vpa")
);

CREATE TABLE IF NOT EXISTS "canteen_payment_routing" (
  "id" text PRIMARY KEY NOT NULL,
  "canteen_id" text NOT NULL UNIQUE REFERENCES "canteen"("id") ON DELETE CASCADE,
  "settlement_account_id" text NOT NULL REFERENCES "settlement_account"("id") ON DELETE RESTRICT,
  "overridden_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "overridden_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "settlement_ledger" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "settlement_account_id" text REFERENCES "settlement_account"("id") ON DELETE SET NULL,
  "order_id" text REFERENCES "order"("id") ON DELETE SET NULL,
  "gross_amount" double precision NOT NULL,
  "platform_fee" double precision NOT NULL,
  "net_amount" double precision NOT NULL,
  "entry_type" text NOT NULL CHECK ("entry_type" IN ('DEBIT', 'REVERSAL')),
  "status" text NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'PROCESSING', 'SETTLED', 'FAILED')),
  "razorpay_payout_id" text,
  "settled_at" timestamp,
  "failure_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "settlement_batch" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "settlement_account_id" text NOT NULL REFERENCES "settlement_account"("id") ON DELETE RESTRICT,
  "total_gross" double precision NOT NULL,
  "total_fee" double precision NOT NULL,
  "total_net" double precision NOT NULL,
  "order_count" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'PROCESSING', 'SETTLED', 'FAILED', 'PARTIALLY_FAILED')),
  "razorpay_payout_id" text,
  "processed_at" timestamp,
  "failure_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
