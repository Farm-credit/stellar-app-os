-- Migration 016: Carbon credit retirement proofs (Issue #1330)
-- When a buyer retires credits, an immutable blockchain receipt is recorded
-- with credits retired, project details, co-benefits achieved, and timestamp.

BEGIN;

CREATE TABLE IF NOT EXISTS retirement_receipts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Idempotency: one receipt per retirement operation.
  retirement_key    VARCHAR(64) NOT NULL UNIQUE,
  -- Buyer identity
  buyer_wallet      VARCHAR(80) NOT NULL,
  buyer_email       VARCHAR(255),
  -- What was retired
  credit_amount     NUMERIC(14, 4) NOT NULL CHECK (credit_amount > 0),
  unit              VARCHAR(10) NOT NULL DEFAULT 'tCO2e',
  -- Project snapshot (copied so later project edits cannot rewrite history)
  project_id        VARCHAR(64) NOT NULL,
  project_name      VARCHAR(255) NOT NULL,
  project_location  VARCHAR(255),
  project_type      VARCHAR(50),
  vintage_year      INT,
  -- Co-benefits snapshot (JSONB array of strings, e.g. biodiversity, jobs)
  co_benefits       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Blockchain proof
  network           VARCHAR(20) NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  -- Stellar transaction hash of the retirement (burn) payment
  tx_hash           VARCHAR(80) NOT NULL,
  -- On-chain memo embedded in the retirement transaction (28-char text memo)
  on_chain_memo     VARCHAR(28),
  -- SHA-256 of the canonical receipt JSON — the digest a verifier recomputes
  receipt_hash      CHAR(64) NOT NULL,
  -- Full receipt document (canonical JSON) for verification convenience
  receipt_payload   JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Worker/lookup paths
CREATE INDEX IF NOT EXISTS idx_retirement_receipts_buyer
  ON retirement_receipts (buyer_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retirement_receipts_project
  ON retirement_receipts (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retirement_receipts_tx
  ON retirement_receipts (tx_hash);
-- Integrity lookups by digest
CREATE INDEX IF NOT EXISTS idx_retirement_receipts_hash
  ON retirement_receipts (receipt_hash);

COMMIT;
