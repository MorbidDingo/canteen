-- Normalize legacy device types into canonical types.
WITH duplicated_gate_codes AS (
  SELECT d.id, d.device_code || '-G' || substr(d.id, 1, 4) AS new_code
  FROM organization_device d
  WHERE d.device_type = 'ATTENDANCE'
    AND EXISTS (
      SELECT 1
      FROM organization_device g
      WHERE g.organization_id = d.organization_id
        AND g.device_type = 'GATE'
        AND g.device_code = d.device_code
        AND g.id <> d.id
    )
)
UPDATE organization_device od
SET device_code = dup.new_code,
    updated_at = now()
FROM duplicated_gate_codes dup
WHERE od.id = dup.id;

WITH duplicated_kiosk_codes AS (
  SELECT d.id, d.device_code || '-K' || substr(d.id, 1, 4) AS new_code
  FROM organization_device d
  WHERE d.device_type = 'CANTEEN'
    AND EXISTS (
      SELECT 1
      FROM organization_device k
      WHERE k.organization_id = d.organization_id
        AND k.device_type = 'KIOSK'
        AND k.device_code = d.device_code
        AND k.id <> d.id
    )
)
UPDATE organization_device od
SET device_code = dup.new_code,
    updated_at = now()
FROM duplicated_kiosk_codes dup
WHERE od.id = dup.id;

UPDATE organization_device
SET device_type = 'GATE',
    updated_at = now()
WHERE device_type = 'ATTENDANCE';

UPDATE organization_device
SET device_type = 'KIOSK',
    updated_at = now()
WHERE device_type = 'CANTEEN';

-- Promote terminal login accounts to dedicated DEVICE role.
UPDATE "user" u
SET role = 'DEVICE',
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM organization_device od
  WHERE od.login_user_id = u.id
);

UPDATE organization_membership om
SET role = 'DEVICE',
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM organization_device od
  WHERE od.login_user_id = om.user_id
    AND od.organization_id = om.organization_id
);

-- Refresh check constraints to include DEVICE role and canonical device types only.
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE "user"
  ADD CONSTRAINT user_role_check
  CHECK (role = ANY (ARRAY['PARENT'::text, 'GENERAL'::text, 'ADMIN'::text, 'OPERATOR'::text, 'MANAGEMENT'::text, 'LIB_OPERATOR'::text, 'ATTENDANCE'::text, 'OWNER'::text, 'DEVICE'::text]));

ALTER TABLE organization_membership DROP CONSTRAINT IF EXISTS organization_membership_role_check;
ALTER TABLE organization_membership
  ADD CONSTRAINT organization_membership_role_check
  CHECK (role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MANAGEMENT'::text, 'OPERATOR'::text, 'LIB_OPERATOR'::text, 'ATTENDANCE'::text, 'PARENT'::text, 'GENERAL'::text, 'DEVICE'::text]));

ALTER TABLE organization_device DROP CONSTRAINT IF EXISTS organization_device_device_type_check;
ALTER TABLE organization_device
  ADD CONSTRAINT organization_device_device_type_check
  CHECK (device_type = ANY (ARRAY['GATE'::text, 'KIOSK'::text, 'LIBRARY'::text]));
