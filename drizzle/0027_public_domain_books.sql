-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add public domain and content type fields to readable_book
ALTER TABLE "readable_book" ADD COLUMN IF NOT EXISTS "is_public_domain" boolean NOT NULL DEFAULT false;
ALTER TABLE "readable_book" ADD COLUMN IF NOT EXISTS "gutenberg_id" text;
ALTER TABLE "readable_book" ADD COLUMN IF NOT EXISTS "source_url" text;
ALTER TABLE "readable_book" ADD COLUMN IF NOT EXISTS "content_type" text NOT NULL DEFAULT 'TEXT';
ALTER TABLE "readable_book" ADD COLUMN IF NOT EXISTS "isbn" text;

-- Migrate book_content_embedding.embedding from text to vector(1536)
ALTER TABLE "book_content_embedding" ADD COLUMN IF NOT EXISTS "embedding_v" vector(1536);
UPDATE "book_content_embedding" SET "embedding_v" = "embedding"::vector WHERE "embedding" IS NOT NULL;
ALTER TABLE "book_content_embedding" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "book_content_embedding" RENAME COLUMN "embedding_v" TO "embedding";

-- Add embedding columns to reading_highlight and reading_bookmark
ALTER TABLE "reading_highlight" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "reading_bookmark" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- Create indexes for vector similarity search
CREATE INDEX IF NOT EXISTS "idx_book_content_embedding_vector" ON "book_content_embedding" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS "idx_reading_highlight_embedding_vector" ON "reading_highlight" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS "idx_reading_bookmark_embedding_vector" ON "reading_bookmark" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- Create indexes for reader stats queries
CREATE INDEX IF NOT EXISTS "idx_reading_session_book_id" ON "reading_session" ("readable_book_id");
CREATE INDEX IF NOT EXISTS "idx_reading_highlight_book_id" ON "reading_highlight" ("readable_book_id");
CREATE INDEX IF NOT EXISTS "idx_reading_bookmark_book_id" ON "reading_bookmark" ("readable_book_id");
CREATE INDEX IF NOT EXISTS "idx_readable_book_public_domain" ON "readable_book" ("organization_id", "is_public_domain") WHERE "status" = 'ACTIVE';
CREATE INDEX IF NOT EXISTS "idx_readable_book_gutenberg_id" ON "readable_book" ("organization_id", "gutenberg_id");
