-- Issues #1700, #1701, #1707: sponsor impact buffers and expiring loyalty points.
CREATE TABLE IF NOT EXISTS project_protection_buffers (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL,
  protected_hectares NUMERIC(12, 2) NOT NULL CHECK (protected_hectares >= 0),
  buffer_radius_m NUMERIC(10, 2) NOT NULL CHECK (buffer_radius_m > 0),
  geometry JSONB NOT NULL,
  methodology TEXT NOT NULL DEFAULT 'Joppa et al. (2016), peer-reviewed protected-area deforestation risk methodology',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_protection_buffers_project_idx ON project_protection_buffers(project_id);
CREATE TABLE IF NOT EXISTS sponsor_loyalty_ledger (
  id BIGSERIAL PRIMARY KEY,
  sponsor_id TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points <> 0),
  reason TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 years'),
  redeemed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sponsor_loyalty_ledger_active_idx ON sponsor_loyalty_ledger(sponsor_id, expires_at) WHERE redeemed_at IS NULL;
