-- Gutenberg Catalog: stores all book metadata fetched from Gutendex API
CREATE TABLE IF NOT EXISTS "gutenberg_catalog" (
  "id" text PRIMARY KEY,
  "gutenberg_id" integer NOT NULL UNIQUE,
  "title" text NOT NULL,
  "authors" text NOT NULL DEFAULT '[]',
  "subjects" text NOT NULL DEFAULT '[]',
  "bookshelves" text NOT NULL DEFAULT '[]',
  "languages" text NOT NULL DEFAULT '[]',
  "formats" text NOT NULL DEFAULT '{}',
  "download_count" integer NOT NULL DEFAULT 0,
  "media_type" text NOT NULL DEFAULT 'Text',
  "cover_image_url" text,
  "category" text NOT NULL DEFAULT 'GENERAL',
  "s3_key" text,
  "s3_content_type" text,
  "is_downloaded" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "idx_gutenberg_catalog_gutenberg_id" ON "gutenberg_catalog" ("gutenberg_id");
CREATE INDEX IF NOT EXISTS "idx_gutenberg_catalog_category" ON "gutenberg_catalog" ("category");
CREATE INDEX IF NOT EXISTS "idx_gutenberg_catalog_downloaded" ON "gutenberg_catalog" ("is_downloaded");
CREATE INDEX IF NOT EXISTS "idx_gutenberg_catalog_download_count" ON "gutenberg_catalog" ("download_count" DESC);
