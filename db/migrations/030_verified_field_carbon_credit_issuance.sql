-- Migration 030: verified field-data carbon credit issuance (Drips #1650)
-- Field measurements are ineligible by default. Only explicitly reviewed samples
-- can be used to calculate incremental CO2 sequestration or support issuance.
BEGIN;

ALTER TABLE research_samples
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE research_samples
    ADD CONSTRAINT research_samples_verification_status_check
    CHECK (verification_status IN ('pending', 'verified', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE research_samples
    ADD CONSTRAINT research_samples_verified_metadata_check
    CHECK (
      verification_status <> 'verified'
      OR (verified_by IS NOT NULL AND btrim(verified_by) <> '' AND verified_at IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_research_samples_verified_tree_date
  ON research_samples (tree_id, sample_date, id)
  WHERE verification_status = 'verified';

-- One row reserves one baseline→latest sample delta before submitting the
-- Soroban transaction. Pending rows are intentionally retained when RPC
-- confirmation is ambiguous so an operator can reconcile by evidence digest
-- instead of accidentally minting the same measurement twice.
CREATE TABLE IF NOT EXISTS field_credit_issuances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id             BIGINT NOT NULL REFERENCES trees(id) ON DELETE RESTRICT,
  sponsor_wallet      TEXT NOT NULL,
  project_id          VARCHAR(20) NOT NULL REFERENCES research_plots(plot_code),
  baseline_sample_id  UUID NOT NULL REFERENCES research_samples(id) ON DELETE RESTRICT,
  latest_sample_id    UUID NOT NULL UNIQUE REFERENCES research_samples(id) ON DELETE RESTRICT,
  measured_delta_kg   NUMERIC(16, 3) NOT NULL CHECK (measured_delta_kg > 0),
  amount_grams        BIGINT NOT NULL CHECK (amount_grams > 0),
  evidence_digest     CHAR(64) NOT NULL UNIQUE
    CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  network             TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  contract_id         TEXT NOT NULL,
  transaction_hash    TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at        TIMESTAMPTZ,
  CONSTRAINT field_credit_issuances_status_check CHECK (
    (status = 'pending' AND transaction_hash IS NULL AND confirmed_at IS NULL)
    OR (status = 'confirmed' AND transaction_hash IS NOT NULL AND confirmed_at IS NOT NULL)
  ),
  CONSTRAINT field_credit_issuances_distinct_samples_check
    CHECK (baseline_sample_id <> latest_sample_id)
);

CREATE INDEX IF NOT EXISTS idx_field_credit_issuances_tree_created
  ON field_credit_issuances (tree_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_credit_issuances_sponsor_status
  ON field_credit_issuances (sponsor_wallet, status, created_at DESC);

COMMIT;
