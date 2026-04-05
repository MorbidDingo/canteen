-- Content Folders
CREATE TABLE IF NOT EXISTS "content_folder" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "author_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Folder Audience (same shape as content_post_audience)
CREATE TABLE IF NOT EXISTS "content_folder_audience" (
  "id" text PRIMARY KEY NOT NULL,
  "folder_id" text NOT NULL REFERENCES "content_folder"("id") ON DELETE CASCADE,
  "audience_type" text NOT NULL,
  "class_name" text,
  "section" text,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "group_id" text REFERENCES "content_group"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "content_folder_audience_target_unique"
    UNIQUE ("folder_id", "audience_type", "class_name", "section", "user_id", "group_id")
);

-- Add folder_id to content_post (nullable – posts can exist outside folders)
ALTER TABLE "content_post"
  ADD COLUMN IF NOT EXISTS "folder_id" text REFERENCES "content_folder"("id") ON DELETE SET NULL;
