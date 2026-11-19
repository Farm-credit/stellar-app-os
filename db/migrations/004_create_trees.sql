-- Migration: 004_create_trees.sql
-- Closes #546
--
-- Stores cached tree records indexed from the on-chain TreeEscrow contract.
-- Keyed on (contract_address, token_id) for idempotent re-indexing.
-- Soft-deleted via deleted_at.

-- UP ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trees (
  -- Internal surrogate key
  id                  BIGSERIAL       PRIMARY KEY,

  -- On-chain identity — (contract_address, token_id) must be globally unique
  contract_address    TEXT            NOT NULL,
  token_id            BIGINT          NOT NULL,
  CONSTRAINT uq_trees_contract_token UNIQUE (contract_address, token_id),

  -- Human-readable tree ID (e.g. 'HRV-2024-0001')
  tree_ref            TEXT            NOT NULL UNIQUE,

  -- FK to planters table (who planted this tree)
  planter_id          BIGINT          REFERENCES planters (id) ON DELETE SET NULL,

  -- FK to species catalogue
  species_slug        TEXT            REFERENCES species_catalogue (slug) ON DELETE SET NULL,

  -- Geographic location (fuzzed ±0.01° for privacy)
  lat                 NUMERIC(9, 6)   NOT NULL,
  lng                 NUMERIC(9, 6)   NOT NULL,
  region              TEXT            NOT NULL,
  country_code        CHAR(2)         NOT NULL,

  -- Lifecycle status — mirrors contract state
  status              TEXT            NOT NULL DEFAULT 'funded'
    CHECK (status IN ('funded', 'planted', 'verified', 'completed', 'failed')),

  -- Stellar escrow account holding USDC for this tree
  escrow_account      TEXT,

  -- Stellar tx hash of the funding event (for auditability)
  funding_tx_hash     TEXT            REFERENCES indexed_transactions (tx_hash),

  -- Timestamps
  planted_at          TIMESTAMPTZ,
  verified_at         TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Soft delete
  deleted_at          TIMESTAMPTZ
);

-- Indexes for REST API queries (GET /trees, GET /trees/:id)
CREATE INDEX IF NOT EXISTS idx_trees_status         ON trees (status);
CREATE INDEX IF NOT EXISTS idx_trees_planter        ON trees (planter_id);
CREATE INDEX IF NOT EXISTS idx_trees_species        ON trees (species_slug);
CREATE INDEX IF NOT EXISTS idx_trees_country        ON trees (country_code);
CREATE INDEX IF NOT EXISTS idx_trees_created        ON trees (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trees_active         ON trees (deleted_at) WHERE deleted_at IS NULL;
