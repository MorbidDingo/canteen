-- Add category to management_notice (GENERAL, EXAM, EVENT, HOLIDAY_ANNOUNCEMENT)
ALTER TABLE "management_notice" ADD COLUMN "category" text NOT NULL DEFAULT 'GENERAL';
