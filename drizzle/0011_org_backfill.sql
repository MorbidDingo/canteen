-- ORG-703 Backfill: assign legacy single-tenant data to a default organization
-- This migration is idempotent and safe to re-run.

DO $$
DECLARE
  default_org_id text;
BEGIN
  -- 1) Ensure a default organization exists for legacy single-tenant records.
  SELECT id
    INTO default_org_id
  FROM organization
  WHERE slug = 'default-org'
  LIMIT 1;

  IF default_org_id IS NULL THEN
    default_org_id := 'org_default';

    INSERT INTO organization (
      id,
      name,
      slug,
      type,
      status,
      created_by_user_id,
      approved_by_user_id,
      approved_at,
      default_timezone,
      created_at,
      updated_at
    )
    SELECT
      default_org_id,
      'Default Organization',
      'default-org',
      'SCHOOL',
      'ACTIVE',
      u.id,
      u.id,
      NOW(),
      'Asia/Kolkata',
      NOW(),
      NOW()
    FROM "user" u
    ORDER BY u.created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot create default organization because table "user" is empty.';
    END IF;
  END IF;

  -- 2) Backfill scoped tables with organization_id.
  UPDATE child
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE temporary_rfid_access tra
  SET organization_id = c.organization_id
  FROM child c
  WHERE tra.child_id = c.id
    AND tra.organization_id IS NULL
    AND c.organization_id IS NOT NULL;

  UPDATE temporary_rfid_access
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE menu_item
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE audit_log
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE book
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE book_copy bc
  SET organization_id = b.organization_id
  FROM book b
  WHERE bc.book_id = b.id
    AND bc.organization_id IS NULL
    AND b.organization_id IS NOT NULL;

  UPDATE book_copy
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE bulk_photo_upload
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE library_setting
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE app_setting
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  -- 3) Seed memberships for all existing users from global role (single-tenant compatibility).
  INSERT INTO organization_membership (
    id,
    organization_id,
    user_id,
    role,
    status,
    joined_at,
    created_at,
    updated_at
  )
  SELECT
    CONCAT('mem_default_', u.id),
    default_org_id,
    u.id,
    CASE
      WHEN u.role IN ('ADMIN', 'MANAGEMENT', 'OPERATOR', 'LIB_OPERATOR', 'ATTENDANCE', 'PARENT', 'GENERAL') THEN u.role
      ELSE 'GENERAL'
    END,
    'ACTIVE',
    COALESCE(u.created_at, NOW()),
    NOW(),
    NOW()
  FROM "user" u
  ON CONFLICT (organization_id, user_id, role) DO NOTHING;
END $$;
