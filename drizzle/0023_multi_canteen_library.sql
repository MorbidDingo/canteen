-- Multi-Canteen & Multi-Library Support
-- Adds canteen and library as first-class sub-entities within an organization.
-- All new FK columns are nullable for backward compatibility.

-- ─── Canteen (sub-entity of organization) ─────────────────

CREATE TABLE IF NOT EXISTS "canteen" (
  "id" text PRIMARY KEY NOT NULL DEFAULT gen_random_uuid()::text,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "location" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "canteen_org_idx" ON "canteen" ("organization_id");

-- ─── Library (sub-entity of organization) ─────────────────

CREATE TABLE IF NOT EXISTS "library" (
  "id" text PRIMARY KEY NOT NULL DEFAULT gen_random_uuid()::text,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "location" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "library_org_idx" ON "library" ("organization_id");

-- ─── Add canteenId to menu_item ───────────────────────────

ALTER TABLE "menu_item" ADD COLUMN IF NOT EXISTS "canteen_id" text REFERENCES "canteen"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "menu_item_canteen_idx" ON "menu_item" ("canteen_id");

-- ─── Add canteenId to order ───────────────────────────────

ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "canteen_id" text REFERENCES "canteen"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "order_canteen_idx" ON "order" ("canteen_id");

-- ─── Add canteenId to pre_order ───────────────────────────

ALTER TABLE "pre_order" ADD COLUMN IF NOT EXISTS "canteen_id" text REFERENCES "canteen"("id") ON DELETE SET NULL;

-- ─── Add libraryId to book ────────────────────────────────

ALTER TABLE "book" ADD COLUMN IF NOT EXISTS "library_id" text REFERENCES "library"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "book_library_idx" ON "book" ("library_id");

-- ─── Add libraryId to book_copy ───────────────────────────

ALTER TABLE "book_copy" ADD COLUMN IF NOT EXISTS "library_id" text REFERENCES "library"("id") ON DELETE SET NULL;

-- ─── Add libraryId to book_issuance ───────────────────────

ALTER TABLE "book_issuance" ADD COLUMN IF NOT EXISTS "library_id" text REFERENCES "library"("id") ON DELETE SET NULL;

-- ─── Add libraryId to library_app_issue_request ───────────

ALTER TABLE "library_app_issue_request" ADD COLUMN IF NOT EXISTS "library_id" text REFERENCES "library"("id") ON DELETE SET NULL;

-- ─── Add libraryId to library_setting (make key unique per library) ─

ALTER TABLE "library_setting" ADD COLUMN IF NOT EXISTS "library_id" text REFERENCES "library"("id") ON DELETE CASCADE;

-- ─── Add canteenId/libraryId to organization_device ───────

ALTER TABLE "organization_device" ADD COLUMN IF NOT EXISTS "canteen_id" text REFERENCES "canteen"("id") ON DELETE SET NULL;
ALTER TABLE "organization_device" ADD COLUMN IF NOT EXISTS "library_id" text REFERENCES "library"("id") ON DELETE SET NULL;
