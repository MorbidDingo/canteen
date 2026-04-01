-- Book Reader System: digital reading with bookmarks, highlights, and AI embeddings

CREATE TABLE IF NOT EXISTS "readable_book" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text REFERENCES "book"("id") ON DELETE SET NULL,
  "organization_id" text REFERENCES "organization"("id") ON DELETE CASCADE,
  "library_id" text REFERENCES "library"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "author" text NOT NULL,
  "category" text NOT NULL DEFAULT 'GENERAL',
  "description" text,
  "cover_image_url" text,
  "language" text NOT NULL DEFAULT 'en',
  "total_pages" integer NOT NULL DEFAULT 0,
  "total_chapters" integer NOT NULL DEFAULT 0,
  "is_audio_enabled" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'DRAFT', 'ARCHIVED')),
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "book_chapter" (
  "id" text PRIMARY KEY NOT NULL,
  "readable_book_id" text NOT NULL REFERENCES "readable_book"("id") ON DELETE CASCADE,
  "chapter_number" integer NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "page_start" integer NOT NULL DEFAULT 1,
  "page_end" integer NOT NULL DEFAULT 1,
  "audio_url" text,
  "created_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "reading_session" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "readable_book_id" text NOT NULL REFERENCES "readable_book"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "current_chapter" integer NOT NULL DEFAULT 1,
  "current_page" integer NOT NULL DEFAULT 1,
  "scroll_position" double precision NOT NULL DEFAULT 0,
  "reading_mode" text NOT NULL DEFAULT 'LIGHT' CHECK ("reading_mode" IN ('LIGHT', 'DARK', 'BLUE_LIGHT', 'GREY')),
  "font_size" integer NOT NULL DEFAULT 16,
  "started_at" timestamp NOT NULL,
  "last_read_at" timestamp NOT NULL,
  CONSTRAINT "reading_session_user_book_unique" UNIQUE ("user_id", "readable_book_id")
);

CREATE TABLE IF NOT EXISTS "reading_bookmark" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "readable_book_id" text NOT NULL REFERENCES "readable_book"("id") ON DELETE CASCADE,
  "chapter_number" integer NOT NULL,
  "page" integer NOT NULL,
  "label" text,
  "created_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "reading_highlight" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "readable_book_id" text NOT NULL REFERENCES "readable_book"("id") ON DELETE CASCADE,
  "chapter_number" integer NOT NULL,
  "page" integer NOT NULL,
  "start_offset" integer NOT NULL,
  "end_offset" integer NOT NULL,
  "highlighted_text" text NOT NULL,
  "color" text NOT NULL DEFAULT '#fbbf24',
  "note" text,
  "created_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "book_content_embedding" (
  "id" text PRIMARY KEY NOT NULL,
  "readable_book_id" text NOT NULL REFERENCES "readable_book"("id") ON DELETE CASCADE,
  "chapter_number" integer NOT NULL,
  "chunk_index" integer NOT NULL DEFAULT 0,
  "content" text NOT NULL,
  "embedding" text,
  "created_at" timestamp NOT NULL
);
