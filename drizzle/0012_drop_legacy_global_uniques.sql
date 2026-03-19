-- ORG-106 Completion: remove legacy global uniqueness constraints
-- Per-organization composite unique constraints are already in place.

ALTER TABLE child DROP CONSTRAINT IF EXISTS child_gr_number_unique;
ALTER TABLE child DROP CONSTRAINT IF EXISTS child_rfid_card_id_unique;
ALTER TABLE temporary_rfid_access DROP CONSTRAINT IF EXISTS temporary_rfid_access_temporary_rfid_card_id_unique;
ALTER TABLE book_copy DROP CONSTRAINT IF EXISTS book_copy_accession_number_unique;
