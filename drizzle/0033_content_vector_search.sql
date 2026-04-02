-- Phase 7A: Content vector search infrastructure
-- Re-enable pgvector for content document embeddings

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Content Document Chunks (for RAG) ────────────────

CREATE TABLE "content_document_chunk" (
  "id" text PRIMARY KEY,
  "post_id" text NOT NULL REFERENCES "content_post"("id") ON DELETE CASCADE,
  "attachment_id" text NOT NULL REFERENCES "content_post_attachment"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- HNSW index for fast ANN cosine similarity search
CREATE INDEX "idx_content_chunk_embedding_hnsw" 
  ON "content_document_chunk" 
  USING hnsw ("embedding" vector_cosine_ops) 
  WITH (m = 16, ef_construction = 64);

-- Scoped lookups
CREATE INDEX "idx_content_chunk_org_post" 
  ON "content_document_chunk" ("organization_id", "post_id");

CREATE INDEX "idx_content_chunk_attachment" 
  ON "content_document_chunk" ("attachment_id");

-- ─── AI Usage Log (cost tracking) ─────────────────────

CREATE TABLE "ai_usage_log" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "type" text NOT NULL, -- CHAT | EMBEDDING | SEARCH
  "tokens" integer NOT NULL DEFAULT 0,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "idx_ai_usage_user_type" 
  ON "ai_usage_log" ("user_id", "type", "created_at");

CREATE INDEX "idx_ai_usage_org" 
  ON "ai_usage_log" ("organization_id", "created_at");
