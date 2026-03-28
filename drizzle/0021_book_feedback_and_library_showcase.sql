-- Library Book Feedback: post-return ratings and reviews for ML recommendations
-- Tags stored as JSON array, e.g. ["page-turner","educational","funny"]

CREATE TABLE IF NOT EXISTS "book_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"issuance_id" text NOT NULL,
	"child_id" text NOT NULL,
	"parent_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"enjoyment_rating" integer NOT NULL,
	"difficulty_rating" integer NOT NULL,
	"would_recommend" boolean NOT NULL,
	"tags" text,
	"review" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "book_feedback_issuance_id_unique" UNIQUE("issuance_id"),
	CONSTRAINT "book_feedback_book_id_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "book"("id") ON DELETE cascade,
	CONSTRAINT "book_feedback_issuance_id_book_issuance_id_fk" FOREIGN KEY ("issuance_id") REFERENCES "book_issuance"("id") ON DELETE cascade,
	CONSTRAINT "book_feedback_child_id_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "child"("id") ON DELETE cascade,
	CONSTRAINT "book_feedback_parent_id_user_id_fk" FOREIGN KEY ("parent_id") REFERENCES "user"("id") ON DELETE cascade,
	CONSTRAINT "book_feedback_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "book_feedback_book_id_idx" ON "book_feedback" ("book_id");
CREATE INDEX IF NOT EXISTS "book_feedback_child_id_idx" ON "book_feedback" ("child_id");
CREATE INDEX IF NOT EXISTS "book_feedback_org_id_idx" ON "book_feedback" ("organization_id");
