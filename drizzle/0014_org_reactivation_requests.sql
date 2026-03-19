CREATE TABLE IF NOT EXISTS organization_reactivation_request (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  requested_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING',
  reason text,
  reviewed_by_user_id text REFERENCES "user"(id),
  reviewed_at timestamp,
  review_notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_reactivation_request_org_idx
  ON organization_reactivation_request (organization_id);

CREATE INDEX IF NOT EXISTS org_reactivation_request_status_idx
  ON organization_reactivation_request (status);

CREATE INDEX IF NOT EXISTS org_reactivation_request_requested_by_idx
  ON organization_reactivation_request (requested_by_user_id);
