-- Remove pgvector: revert embedding columns from vector to text
-- Vector DB (e.g. Pinecone) will be used for embeddings in the future

-- Drop vector similarity search indexes
DROP INDEX IF EXISTS "idx_book_content_embedding_vector";
DROP INDEX IF EXISTS "idx_reading_highlight_embedding_vector";
DROP INDEX IF EXISTS "idx_reading_bookmark_embedding_vector";

-- Convert book_content_embedding.embedding from vector to text
ALTER TABLE "book_content_embedding" ADD COLUMN IF NOT EXISTS "embedding_t" text;
UPDATE "book_content_embedding" SET "embedding_t" = "embedding"::text WHERE "embedding" IS NOT NULL;
ALTER TABLE "book_content_embedding" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "book_content_embedding" RENAME COLUMN "embedding_t" TO "embedding";

-- Convert reading_highlight.embedding from vector to text
ALTER TABLE "reading_highlight" ADD COLUMN IF NOT EXISTS "embedding_t" text;
UPDATE "reading_highlight" SET "embedding_t" = "embedding"::text WHERE "embedding" IS NOT NULL;
ALTER TABLE "reading_highlight" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "reading_highlight" RENAME COLUMN "embedding_t" TO "embedding";

-- Convert reading_bookmark.embedding from vector to text
ALTER TABLE "reading_bookmark" ADD COLUMN IF NOT EXISTS "embedding_t" text;
UPDATE "reading_bookmark" SET "embedding_t" = "embedding"::text WHERE "embedding" IS NOT NULL;
ALTER TABLE "reading_bookmark" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "reading_bookmark" RENAME COLUMN "embedding_t" TO "embedding";

-- Drop pgvector extension
DROP EXTENSION IF EXISTS vector;
