-- Payment Event Accounts: UPI / Bank accounts created by operators, pending management approval
CREATE TABLE IF NOT EXISTS "payment_event_account" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "created_by_operator_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "method" text NOT NULL,
  "upi_id" text,
  "account_holder_name" text,
  "account_number" text,
  "ifsc_code" text,
  "bank_name" text,
  "status" text DEFAULT 'PENDING_APPROVAL' NOT NULL,
  "approved_by_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "approved_at" timestamp,
  "rejection_reason" text,
  "created_at" timestamp NOT NULL
);

-- Payment Events: events created by operators for fixed-amount fee collection
CREATE TABLE IF NOT EXISTS "payment_event" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "created_by_operator_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "payment_account_id" text REFERENCES "payment_event_account"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "amount" double precision NOT NULL,
  "target_type" text DEFAULT 'BOTH' NOT NULL,
  "target_class" text,
  "target_account_ids" text,
  "due_date" timestamp,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "kiosk_mode" boolean DEFAULT false NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

-- Payment Event Receipts: proof of payment per student/account
CREATE TABLE IF NOT EXISTS "payment_event_receipt" (
  "id" text PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL REFERENCES "payment_event"("id") ON DELETE CASCADE,
  "paid_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "child_id" text REFERENCES "child"("id") ON DELETE SET NULL,
  "payment_mode" text NOT NULL,
  "amount" double precision NOT NULL,
  "receipt_number" text NOT NULL,
  "notes" text,
  "paid_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL
);
