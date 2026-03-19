ALTER TABLE organization_device
  ADD COLUMN IF NOT EXISTS current_ip text,
  ADD COLUMN IF NOT EXISTS last_ip text,
  ADD COLUMN IF NOT EXISTS last_user_agent text;

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS device_id text REFERENCES organization_device(id) ON DELETE SET NULL;

ALTER TABLE book_issuance
  ADD COLUMN IF NOT EXISTS device_id text REFERENCES organization_device(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS order_device_id_idx ON "order" (device_id);
CREATE INDEX IF NOT EXISTS book_issuance_device_id_idx ON book_issuance (device_id);
CREATE INDEX IF NOT EXISTS organization_device_current_ip_idx ON organization_device (current_ip);
