ALTER TABLE organization_device
  ADD COLUMN IF NOT EXISTS device_name text NOT NULL DEFAULT 'Terminal';

ALTER TABLE organization_device
  ADD COLUMN IF NOT EXISTS login_user_id text REFERENCES "user"(id) ON DELETE SET NULL;

ALTER TABLE organization_device
  ADD COLUMN IF NOT EXISTS created_by_user_id text REFERENCES "user"(id);

CREATE TABLE IF NOT EXISTS organization_device_assignment (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES organization_device(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  assigned_by_user_id text REFERENCES "user"(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT organization_device_assignment_device_user_unique UNIQUE (device_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_device_assignment_org_idx
  ON organization_device_assignment (organization_id);

CREATE INDEX IF NOT EXISTS organization_device_assignment_device_idx
  ON organization_device_assignment (device_id);

CREATE INDEX IF NOT EXISTS organization_device_assignment_user_idx
  ON organization_device_assignment (user_id);
