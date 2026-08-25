-- Migration: 005_create_progress_updates.sql
-- Closes #546
--
-- High-volume event log: every on-chain status change, photo submission, or
-- GPS ping for a tree is recorded here.
--
-- Indexed on (tree_id, created_at DESC) for efficient timeline pagination.
-- paging_token is the Horizon operation paging token — used to prevent
-- duplicate ingestion on indexer restarts (idempotency key).

-- UP ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS progress_updates (
  -- Internal surrogate key
  id                BIGSERIAL       PRIMARY KEY,

  -- FK to the tree this update belongs to
  tree_id           BIGINT          NOT NULL REFERENCES trees (id) ON DELETE CASCADE,

  -- Horizon paging token of the source operation — unique ingestion guard
  paging_token      TEXT            NOT NULL UNIQUE,

  -- Type of update
  update_type       TEXT            NOT NULL
    CHECK (update_type IN (
      'status_change',   -- contract state transition
      'photo_submitted', -- planter submitted a photo proof
      'gps_ping',        -- GPS location evidence submitted
      'survival_check',  -- periodic survival verification
      'note'             -- free-form admin note
    )),

  -- Previous and new status (populated for status_change updates)
  from_status       TEXT
    CHECK (from_status IS NULL OR from_status IN ('funded', 'planted', 'verified', 'completed', 'failed')),
  to_status         TEXT
    CHECK (to_status IS NULL OR to_status IN ('funded', 'planted', 'verified', 'completed', 'failed')),

  -- GPS coordinates reported in this update (may differ from tree.lat/lng)
  lat               NUMERIC(9, 6),
  lng               NUMERIC(9, 6),

  -- Off-chain media: IPFS CID or signed URL for photo evidence
  media_url         TEXT,

  -- IPFS CID of the raw photo (immutable audit link)
  ipfs_cid          TEXT,

  -- Free-form metadata (e.g. survival score, verifier notes)
  metadata          JSONB           NOT NULL DEFAULT '{}',

  -- Stellar account that submitted the update
  submitted_by      TEXT,

  -- Ledger timestamp of the source Horizon operation
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Primary access pattern: chronological timeline for a single tree
CREATE INDEX IF NOT EXISTS idx_pu_tree_created   ON progress_updates (tree_id, created_at DESC);

-- Indexer cursor: resume from last processed paging_token per tree
CREATE INDEX IF NOT EXISTS idx_pu_paging_token   ON progress_updates (paging_token);

-- Allow filtering by update type across all trees
CREATE INDEX IF NOT EXISTS idx_pu_update_type    ON progress_updates (update_type);

-- Partial index for unprocessed survival checks (operational monitoring)
CREATE INDEX IF NOT EXISTS idx_pu_survival       ON progress_updates (created_at DESC)
  WHERE update_type = 'survival_check';
