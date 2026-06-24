-- Migration: 002_create_admin_tables.sql
-- Admin dashboard supporting tables:
--   verification_queue - tracks project/farmer verification submissions
--   disputes - tracks open and resolved disputes
--   fee_treasury_log - logs fee treasury transactions (balance tracking)

CREATE TABLE IF NOT EXISTS verification_queue (
  id                SERIAL      PRIMARY KEY,
  project_name      TEXT        NOT NULL,
  applicant_name    TEXT        NOT NULL,
  location          TEXT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status            TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resubmitted', 'approved', 'rejected')),
  flagged           BOOLEAN     NOT NULL DEFAULT FALSE,
  missing_fields    TEXT[]      DEFAULT '{}',
  resubmission_count INTEGER   NOT NULL DEFAULT 0,
  notes             TEXT
);

CREATE TABLE IF NOT EXISTS disputes (
  id                SERIAL      PRIMARY KEY,
  escrow_id         TEXT,
  farmer_public_key TEXT        NOT NULL,
  donor_public_key  TEXT,
  contract_type     TEXT,
  amount            NUMERIC(30, 7),
  status            TEXT        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'refunded')),
  reason            TEXT,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  resolved_by       TEXT,
  resolution        TEXT
);

CREATE TABLE IF NOT EXISTS fee_treasury_log (
  id                SERIAL      PRIMARY KEY,
  tx_hash           TEXT,
  source            TEXT,
  amount            NUMERIC(30, 7) NOT NULL,
  asset_code        TEXT        NOT NULL DEFAULT 'USDC',
  tx_type           TEXT        NOT NULL CHECK (tx_type IN ('credit', 'debit')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  memo              TEXT
);

CREATE INDEX IF NOT EXISTS idx_vq_status ON verification_queue (status);
CREATE INDEX IF NOT EXISTS idx_disp_status ON disputes (status);
CREATE INDEX IF NOT EXISTS idx_fee_created ON fee_treasury_log (created_at DESC);
