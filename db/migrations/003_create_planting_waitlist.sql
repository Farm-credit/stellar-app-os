-- Migration: 003_create_planting_waitlist.sql
-- Queues planting jobs when no planter is available in the requested region.

CREATE TABLE IF NOT EXISTS planting_waitlist (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who sponsored the tree
  sponsor_email   TEXT        NOT NULL,
  sponsor_name    TEXT        NOT NULL,

  -- What they want planted
  tree_id         TEXT        NOT NULL,
  species         TEXT        NOT NULL,
  region          TEXT        NOT NULL,

  -- Queue tracking
  status          TEXT        NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'assigned', 'cancelled')),

  -- Estimated wait time in days (updated periodically by a background job)
  estimated_wait_days  INTEGER,

  -- When a planter becomes available and takes the job
  assigned_planter_id  TEXT,
  assigned_at          TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_region  ON planting_waitlist (region, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_tree_id ON planting_waitlist (tree_id);
