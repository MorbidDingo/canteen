CREATE TABLE "temporary_rfid_access" (
  "id" text PRIMARY KEY NOT NULL,
  "child_id" text NOT NULL,
  "temporary_rfid_card_id" text NOT NULL,
  "access_type" text NOT NULL DEFAULT 'STUDENT_TEMP',
  "valid_from" timestamp NOT NULL,
  "valid_until" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_by_operator_id" text,
  "notes" text,
  "created_at" timestamp NOT NULL
);

ALTER TABLE "temporary_rfid_access"
  ADD CONSTRAINT "temporary_rfid_access_child_id_child_id_fk"
  FOREIGN KEY ("child_id") REFERENCES "public"."child"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "temporary_rfid_access"
  ADD CONSTRAINT "temporary_rfid_access_created_by_operator_id_user_id_fk"
  FOREIGN KEY ("created_by_operator_id") REFERENCES "public"."user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "temporary_rfid_access_temp_card_unique"
  ON "temporary_rfid_access" ("temporary_rfid_card_id");

CREATE INDEX "temporary_rfid_access_child_idx"
  ON "temporary_rfid_access" ("child_id");

CREATE INDEX "temporary_rfid_access_valid_until_idx"
  ON "temporary_rfid_access" ("valid_until");
