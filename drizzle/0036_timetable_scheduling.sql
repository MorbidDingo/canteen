-- ─── Timetable Scheduling System ─────────────────────────

CREATE TABLE IF NOT EXISTS "timetable_config" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL DEFAULT 'Default',
  "periods_per_day" integer NOT NULL DEFAULT 8,
  "days_per_week" integer NOT NULL DEFAULT 6,
  "period_duration_minutes" integer NOT NULL DEFAULT 45,
  "start_time" text NOT NULL DEFAULT '08:00',
  "break_after_period" jsonb DEFAULT '[]',
  "break_duration_minutes" integer NOT NULL DEFAULT 15,
  "lunch_after_period" integer DEFAULT 4,
  "lunch_duration_minutes" integer NOT NULL DEFAULT 30,
  "active_days" jsonb DEFAULT '["Mon","Tue","Wed","Thu","Fri","Sat"]',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "timetable_teacher" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "short_code" text NOT NULL,
  "email" text,
  "phone" text,
  "department" text,
  "max_periods_per_day" integer DEFAULT 6,
  "max_periods_per_week" integer DEFAULT 30,
  "preferred_slots" jsonb DEFAULT '[]',
  "unavailable_slots" jsonb DEFAULT '[]',
  "consecutive_period_limit" integer DEFAULT 3,
  "user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "timetable_subject" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "short_code" text NOT NULL,
  "color" text NOT NULL DEFAULT '#6366f1',
  "periods_per_week" integer NOT NULL DEFAULT 5,
  "requires_lab" boolean NOT NULL DEFAULT false,
  "is_elective" boolean NOT NULL DEFAULT false,
  "prefer_morning" boolean NOT NULL DEFAULT false,
  "prefer_afternoon" boolean NOT NULL DEFAULT false,
  "max_consecutive" integer DEFAULT 2,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "timetable_classroom" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "short_code" text NOT NULL,
  "capacity" integer NOT NULL DEFAULT 40,
  "room_type" text NOT NULL DEFAULT 'REGULAR',
  "has_projector" boolean NOT NULL DEFAULT false,
  "has_ac" boolean NOT NULL DEFAULT false,
  "floor" text,
  "building" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "timetable_student_group" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "short_code" text NOT NULL,
  "grade" text,
  "section" text,
  "strength" integer NOT NULL DEFAULT 30,
  "home_room_id" text REFERENCES "timetable_classroom"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "timetable_teacher_subject" (
  "id" text PRIMARY KEY NOT NULL,
  "teacher_id" text NOT NULL REFERENCES "timetable_teacher"("id") ON DELETE CASCADE,
  "subject_id" text NOT NULL REFERENCES "timetable_subject"("id") ON DELETE CASCADE,
  "student_group_id" text REFERENCES "timetable_student_group"("id") ON DELETE SET NULL,
  "is_primary" boolean NOT NULL DEFAULT true,
  CONSTRAINT "unique_teacher_subject_group" UNIQUE("teacher_id", "subject_id", "student_group_id")
);

CREATE TABLE IF NOT EXISTS "timetable" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "config_id" text NOT NULL REFERENCES "timetable_config"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "generation_method" text NOT NULL DEFAULT 'AI',
  "conflict_count" integer NOT NULL DEFAULT 0,
  "score" double precision DEFAULT 0,
  "ai_explanation" text,
  "metadata" jsonb DEFAULT '{}',
  "published_at" timestamp,
  "created_by" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "timetable_slot" (
  "id" text PRIMARY KEY NOT NULL,
  "timetable_id" text NOT NULL REFERENCES "timetable"("id") ON DELETE CASCADE,
  "day" text NOT NULL,
  "period" integer NOT NULL,
  "teacher_id" text REFERENCES "timetable_teacher"("id") ON DELETE SET NULL,
  "subject_id" text REFERENCES "timetable_subject"("id") ON DELETE SET NULL,
  "classroom_id" text REFERENCES "timetable_classroom"("id") ON DELETE SET NULL,
  "student_group_id" text REFERENCES "timetable_student_group"("id") ON DELETE SET NULL,
  "is_locked" boolean NOT NULL DEFAULT false,
  "is_manual_override" boolean NOT NULL DEFAULT false,
  "conflict_flags" jsonb DEFAULT '[]',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "timetable_constraint" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "weight" integer NOT NULL DEFAULT 50,
  "parameters" jsonb DEFAULT '{}',
  "is_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "timetable_change_log" (
  "id" text PRIMARY KEY NOT NULL,
  "timetable_id" text NOT NULL REFERENCES "timetable"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "change_type" text NOT NULL,
  "description" text NOT NULL,
  "previous_state" jsonb,
  "new_state" jsonb,
  "ai_command" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "timetable_ai_preference" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "preference_type" text NOT NULL,
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "confidence" double precision NOT NULL DEFAULT 0.5,
  "learned_from_count" integer NOT NULL DEFAULT 1,
  "last_updated" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "idx_timetable_config_org" ON "timetable_config"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_teacher_org" ON "timetable_teacher"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_subject_org" ON "timetable_subject"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_classroom_org" ON "timetable_classroom"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_student_group_org" ON "timetable_student_group"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_org" ON "timetable"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_slot_timetable" ON "timetable_slot"("timetable_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_slot_day_period" ON "timetable_slot"("timetable_id", "day", "period");
CREATE INDEX IF NOT EXISTS "idx_timetable_slot_teacher" ON "timetable_slot"("teacher_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_slot_group" ON "timetable_slot"("student_group_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_constraint_org" ON "timetable_constraint"("organization_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_change_log_timetable" ON "timetable_change_log"("timetable_id");
CREATE INDEX IF NOT EXISTS "idx_timetable_ai_preference_org" ON "timetable_ai_preference"("organization_id");
