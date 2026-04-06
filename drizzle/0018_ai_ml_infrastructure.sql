-- Phase 3: AI/ML Infrastructure
-- New tables for anomaly alerts, ML recommendation cache, and AI scheduled actions.
-- Extends parent_control with AI auto-order toggle.

-- ─── anomaly_alert ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "anomaly_alert" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"data" text,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anomaly_alert_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "child"("id") ON DELETE cascade,
	CONSTRAINT "anomaly_alert_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "anomaly_alert_child_id_idx" ON "anomaly_alert" ("child_id");
CREATE INDEX IF NOT EXISTS "anomaly_alert_org_id_idx" ON "anomaly_alert" ("organization_id");
CREATE INDEX IF NOT EXISTS "anomaly_alert_acknowledged_idx" ON "anomaly_alert" ("acknowledged");
CREATE INDEX IF NOT EXISTS "anomaly_alert_created_at_idx" ON "anomaly_alert" ("created_at");

-- ─── ml_recommendation_cache ─────────────────────────────
CREATE TABLE IF NOT EXISTS "ml_recommendation_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"child_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"time_slot" text NOT NULL,
	"recommendations" text NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "ml_recommendation_cache_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "child"("id") ON DELETE cascade,
	CONSTRAINT "ml_recommendation_cache_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "ml_recommendation_cache_child_org_slot_idx" ON "ml_recommendation_cache" ("child_id", "organization_id", "time_slot");
CREATE INDEX IF NOT EXISTS "ml_recommendation_cache_expires_at_idx" ON "ml_recommendation_cache" ("expires_at");

-- ─── ai_scheduled_action ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "ai_scheduled_action" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"child_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"action_type" text NOT NULL,
	"payload" text NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"executed_at" timestamp,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_scheduled_action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade,
	CONSTRAINT "ai_scheduled_action_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "child"("id") ON DELETE cascade,
	CONSTRAINT "ai_scheduled_action_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "ai_scheduled_action_status_scheduled_idx" ON "ai_scheduled_action" ("status", "scheduled_for");
CREATE INDEX IF NOT EXISTS "ai_scheduled_action_user_id_idx" ON "ai_scheduled_action" ("user_id");

-- ─── Extend parent_control ───────────────────────────────
ALTER TABLE "parent_control" ADD COLUMN IF NOT EXISTS "ai_auto_order_enabled" boolean DEFAULT false NOT NULL;
