CREATE TABLE IF NOT EXISTS "order_feedback" (
  "id" text PRIMARY KEY NOT NULL,
  "order_id" text NOT NULL REFERENCES "order"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "healthy_rating" integer NOT NULL,
  "taste_rating" integer NOT NULL,
  "quantity_rating" integer NOT NULL,
  "overall_review" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_feedback_order_id_unique" ON "order_feedback" ("order_id");

CREATE TABLE IF NOT EXISTS "order_cancellation_reason" (
  "id" text PRIMARY KEY NOT NULL,
  "order_id" text NOT NULL REFERENCES "order"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "other_text" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_cancellation_reason_order_id_unique" ON "order_cancellation_reason" ("order_id");
