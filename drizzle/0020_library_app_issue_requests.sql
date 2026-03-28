CREATE TABLE IF NOT EXISTS "library_app_issue_request" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "parent_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "child_id" text NOT NULL REFERENCES "child"("id") ON DELETE CASCADE,
  "book_id" text NOT NULL REFERENCES "book"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'REQUESTED',
  "expires_at" timestamp NOT NULL,
  "confirmed_at" timestamp,
  "confirmed_device_id" text REFERENCES "organization_device"("id") ON DELETE SET NULL,
  "issuance_id" text REFERENCES "book_issuance"("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "library_app_issue_request_org_status_idx"
  ON "library_app_issue_request" ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "library_app_issue_request_child_status_idx"
  ON "library_app_issue_request" ("child_id", "status");

CREATE INDEX IF NOT EXISTS "library_app_issue_request_book_status_idx"
  ON "library_app_issue_request" ("book_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "library_app_issue_request_issuance_unique"
  ON "library_app_issue_request" ("issuance_id")
  WHERE "issuance_id" IS NOT NULL;
