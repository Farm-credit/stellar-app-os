-- Migration: 009_create_planter_payouts.sql
--
-- Materialises payout events for planters as a dedicated table so we can
-- serve fast per-planter, per-year tax exports without full-scanning
-- indexed_transactions.
--
-- A "payout" is any indexed transaction whose destination matches a
-- planter's stellar_address and whose tx_type indicates an escrow release
-- (escrow_planting, escrow_survival) or a direct payment.
--
-- The table is populated by the indexer when it classifies a transaction
-- as a planter payment. It may also be back-filled from indexed_transactions
-- via the view defined below.

-- UP ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planter_payouts (
  -- Surrogate key
  id                  BIGSERIAL     PRIMARY KEY,

  -- FK to planters table
  planter_id          BIGINT        NOT NULL REFERENCES planters (id) ON DELETE CASCADE,

  -- FK to indexed_transactions — the on-chain event
  tx_hash             TEXT          NOT NULL REFERENCES indexed_transactions (tx_hash),

  -- Denormalised for fast query / CSV export without joins
  stellar_address     TEXT          NOT NULL,

  -- ISO-8601 date that the payout was settled on-chain
  paid_at             TIMESTAMPTZ   NOT NULL,

  -- Calendar year extracted from paid_at (for the index below)
  tax_year            SMALLINT      NOT NULL GENERATED ALWAYS AS (
                        EXTRACT(YEAR FROM paid_at)::SMALLINT
                      ) STORED,

  -- Asset identifier
  asset_code          TEXT          NOT NULL DEFAULT 'XLM',
  asset_issuer        TEXT,

  -- Gross payout amount (positive)
  amount              NUMERIC(30, 7) NOT NULL,

  -- Human-readable reason / event type (mirrors indexed_transactions.tx_type)
  payout_type         TEXT          NOT NULL
    CHECK (payout_type IN ('escrow_planting', 'escrow_survival', 'direct', 'other')),

  -- Memo from the Stellar transaction (useful for tax reference)
  memo                TEXT,

  -- FK to trees if this payout is tied to a specific tree job
  tree_id             BIGINT        REFERENCES trees (id) ON DELETE SET NULL,

  -- Timestamps
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Prevent duplicate rows for the same on-chain event
  CONSTRAINT uq_planter_payouts_tx UNIQUE (tx_hash)
);

-- Indexes optimised for the export query: WHERE planter_id = $1 AND tax_year = $2
CREATE INDEX IF NOT EXISTS idx_pp_planter_year
  ON planter_payouts (planter_id, tax_year, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_pp_stellar_year
  ON planter_payouts (stellar_address, tax_year);

-- View that back-fills from indexed_transactions for any planter payout
-- that was not yet inserted into planter_payouts.
-- Useful for historical imports; the indexer should prefer the table.
CREATE OR REPLACE VIEW v_planter_payouts_from_indexed AS
  SELECT
    p.id                               AS planter_id,
    it.tx_hash,
    p.stellar_address,
    it.created_at                      AS paid_at,
    EXTRACT(YEAR FROM it.created_at)::SMALLINT AS tax_year,
    COALESCE(it.asset_code, 'XLM')     AS asset_code,
    it.asset_issuer,
    it.amount,
    it.tx_type                         AS payout_type,
    it.memo,
    NULL::BIGINT                       AS tree_id
  FROM indexed_transactions it
  JOIN planters p ON p.stellar_address = it.destination
  WHERE it.tx_type IN ('escrow_planting', 'escrow_survival')
    AND it.amount IS NOT NULL
    AND p.deleted_at IS NULL;

-- DOWN ────────────────────────────────────────────────────────────────────────
-- DROP VIEW  IF EXISTS v_planter_payouts_from_indexed;
-- DROP TABLE IF EXISTS planter_payouts;
