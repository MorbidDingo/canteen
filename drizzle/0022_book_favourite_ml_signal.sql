CREATE TABLE IF NOT EXISTS "book_favourite" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL REFERENCES "book"("id") ON DELETE CASCADE,
  "parent_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL,
  CONSTRAINT "book_favourite_book_parent_org_unique" UNIQUE("book_id", "parent_id", "organization_id")
);
