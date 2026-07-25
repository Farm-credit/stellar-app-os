-- Migration: 003_create_contract_events.sql
-- Stores Soroban contract events streamed from Stellar Horizon / Soroban RPC.
-- Tracks TreeMinted, ProgressSubmitted, and FundsReleased events emitted
-- by the tree-escrow and planting contracts.

CREATE TABLE IF NOT EXISTS contract_events (
  -- Soroban event ID (globally unique, assigned by the network)
  id                  TEXT        PRIMARY KEY,

  -- Ledger this event was emitted in
  ledger              BIGINT      NOT NULL,

  -- ISO-8601 ledger close time
  ledger_closed_at    TIMESTAMPTZ NOT NULL,

  -- Contract that emitted the event
  contract_id         TEXT        NOT NULL,

  -- Classified event name
  event_type          TEXT        NOT NULL
    CHECK (event_type IN ('TreeMinted', 'ProgressSubmitted', 'FundsReleased', 'other')),

  -- XDR-encoded topic values (base64), ordered as emitted
  topics_xdr          TEXT[]      NOT NULL,

  -- XDR-encoded event value (base64), if present
  value_xdr           TEXT,

  -- Cursor for resuming the event stream from this position
  paging_token        TEXT,

  -- Indexer bookkeeping
  indexed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ce_event_type    ON contract_events (event_type);
CREATE INDEX IF NOT EXISTS idx_ce_ledger        ON contract_events (ledger DESC);
CREATE INDEX IF NOT EXISTS idx_ce_contract_id   ON contract_events (contract_id);
CREATE INDEX IF NOT EXISTS idx_ce_closed_at     ON contract_events (ledger_closed_at DESC);

-- Persists the last ledger processed per network so the worker can resume after restart.
CREATE TABLE IF NOT EXISTS event_indexer_cursors (
  id              SERIAL      PRIMARY KEY,
  network         TEXT        NOT NULL UNIQUE,  -- 'testnet' | 'mainnet'
  last_ledger     BIGINT      NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
