-- Add exam-specific fields to management_notice table
ALTER TABLE "management_notice" ADD COLUMN IF NOT EXISTS "exam_start_date" timestamp;
ALTER TABLE "management_notice" ADD COLUMN IF NOT EXISTS "exam_end_date" timestamp;
ALTER TABLE "management_notice" ADD COLUMN IF NOT EXISTS "exam_subjects" text;
