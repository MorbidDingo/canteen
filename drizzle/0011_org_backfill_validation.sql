-- ORG-703 Validation Queries
-- Run after 0011_org_backfill.sql

SELECT 'child' AS table_name, COUNT(*) AS null_org_rows
FROM child
WHERE organization_id IS NULL
UNION ALL
SELECT 'temporary_rfid_access', COUNT(*)
FROM temporary_rfid_access
WHERE organization_id IS NULL
UNION ALL
SELECT 'menu_item', COUNT(*)
FROM menu_item
WHERE organization_id IS NULL
UNION ALL
SELECT 'audit_log', COUNT(*)
FROM audit_log
WHERE organization_id IS NULL
UNION ALL
SELECT 'book', COUNT(*)
FROM book
WHERE organization_id IS NULL
UNION ALL
SELECT 'book_copy', COUNT(*)
FROM book_copy
WHERE organization_id IS NULL
UNION ALL
SELECT 'bulk_photo_upload', COUNT(*)
FROM bulk_photo_upload
WHERE organization_id IS NULL
UNION ALL
SELECT 'library_setting', COUNT(*)
FROM library_setting
WHERE organization_id IS NULL
UNION ALL
SELECT 'app_setting', COUNT(*)
FROM app_setting
WHERE organization_id IS NULL;

-- Any duplicates here must be resolved before dropping old global unique constraints.
SELECT organization_id, gr_number, COUNT(*)
FROM child
WHERE gr_number IS NOT NULL
GROUP BY organization_id, gr_number
HAVING COUNT(*) > 1;

SELECT organization_id, rfid_card_id, COUNT(*)
FROM child
WHERE rfid_card_id IS NOT NULL
GROUP BY organization_id, rfid_card_id
HAVING COUNT(*) > 1;

SELECT organization_id, temporary_rfid_card_id, COUNT(*)
FROM temporary_rfid_access
WHERE temporary_rfid_card_id IS NOT NULL
GROUP BY organization_id, temporary_rfid_card_id
HAVING COUNT(*) > 1;

SELECT organization_id, accession_number, COUNT(*)
FROM book_copy
WHERE accession_number IS NOT NULL
GROUP BY organization_id, accession_number
HAVING COUNT(*) > 1;

-- Sanity check: users without at least one active membership.
SELECT u.id, u.email, u.role
FROM "user" u
LEFT JOIN organization_membership om
  ON om.user_id = u.id
 AND om.status = 'ACTIVE'
WHERE om.id IS NULL;
