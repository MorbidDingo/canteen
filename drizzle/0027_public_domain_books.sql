-- Add public domain and content type fields to readable_book
ALTER TABLE "readable_book" ADD COLUMN IF NOT EXISTS "is_public_domain" boolean NOT NULL DEFAULT false;
ALTER TABLE "readable_book" ADD COLUMN IF NOT EXISTS "gutenberg_id" text;
ALTER TABLE "readable_book" ADD COLUMN IF NOT EXISTS "source_url" text;
ALTER TABLE "readable_book" ADD COLUMN IF NOT EXISTS "content_type" text NOT NULL DEFAULT 'TEXT';
ALTER TABLE "readable_book" ADD COLUMN IF NOT EXISTS "isbn" text;
