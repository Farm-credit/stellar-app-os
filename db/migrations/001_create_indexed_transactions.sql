-- Migration: 001_create_indexed_transactions.sql
-- Stores every Stellar transaction relevant to FarmCredit:
--   donations, escrow events (deposit/verify_planting/verify_survival/refund),
--   and carbon-credit token mints.

CREATE TABLE IF NOT EXISTS indexed_transactions (
  -- Stellar transaction hash (primary key — globally unique)
  tx_hash         TEXT        PRIMARY KEY,

  -- Ledger sequence number (for ordering / cursor resumption)
  ledger          BIGINT      NOT NULL,

  -- ISO-8601 timestamp from Horizon
  created_at      TIMESTAMPTZ NOT NULL,

  -- Stellar source account
  source_account  TEXT        NOT NULL,

  -- Classified event type
  tx_type         TEXT        NOT NULL
    CHECK (tx_type IN ('donation', 'escrow_deposit', 'escrow_planting',
                       'escrow_survival', 'escrow_refund', 'token_mint', 'other')),

  -- Asset code (USDC, CARBON, XLM, …)
  asset_code      TEXT,

  -- Asset issuer public key
  asset_issuer    TEXT,

  -- Transfer amount (as text to preserve precision)
  amount          NUMERIC(30, 7),

  -- Destination / recipient account
  destination     TEXT,

  -- Raw memo text (if present)
  memo            TEXT,

  -- Full Horizon transaction record (JSONB for ad-hoc queries)
  raw             JSONB       NOT NULL,

  -- Indexer bookkeeping
  indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups by type and time
CREATE INDEX IF NOT EXISTS idx_it_tx_type    ON indexed_transactions (tx_type);
CREATE INDEX IF NOT EXISTS idx_it_created_at ON indexed_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_it_source     ON indexed_transactions (source_account);
CREATE INDEX IF NOT EXISTS idx_it_dest       ON indexed_transactions (destination);

-- Cursor persistence: one row per (network, account) pair being watched
CREATE TABLE IF NOT EXISTS indexer_cursors (
  id              SERIAL      PRIMARY KEY,
  network         TEXT        NOT NULL,  -- 'testnet' | 'mainnet'
  watch_account   TEXT        NOT NULL,  -- Stellar account being streamed
  last_paging_token TEXT      NOT NULL DEFAULT 'now',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (network, watch_account)
);
