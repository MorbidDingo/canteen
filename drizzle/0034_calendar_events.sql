-- Add event_date to management_notice for calendar display
ALTER TABLE "management_notice" ADD COLUMN "event_date" timestamp;

-- School holidays table
CREATE TABLE IF NOT EXISTS "school_holiday" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "start_date" timestamp NOT NULL,
  "end_date" timestamp,
  "description" text,
  "created_by" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now()
);
