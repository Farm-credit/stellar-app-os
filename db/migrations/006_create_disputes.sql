-- Migration: 006_create_disputes.sql
-- Closes #546
--
-- Records formal disputes raised against a tree record — e.g. planting fraud,
-- survival failure, or escrow release disagreement.
--
-- Uses a proper status enum covering the full dispute workflow rather than a
-- loose TEXT column, so invalid state transitions can be caught at the DB layer.

-- UP ─────────────────────────────────────────────────────────────────────────

-- Dispute status lifecycle:
--   open → under_review → resolved | escalated → closed
CREATE TYPE dispute_status AS ENUM (
  'open',
  'under_review',
  'resolved',
  'escalated',
  'closed'
);

-- Dispute category
CREATE TYPE dispute_category AS ENUM (
  'planting_fraud',      -- Tree never planted / photo fake
  'survival_failure',    -- Tree died before completion
  'escrow_release',      -- Disagreement over escrow payout
  'gps_mismatch',        -- GPS coordinates do not match claimed location
  'admin_error',         -- Data entry / indexing mistake
  'other'
);

CREATE TABLE IF NOT EXISTS disputes (
  -- Internal surrogate key
  id                  BIGSERIAL         PRIMARY KEY,

  -- The tree this dispute is about
  tree_id             BIGINT            NOT NULL REFERENCES trees (id) ON DELETE CASCADE,

  -- Stellar account of the party raising the dispute (sponsor, planter, or admin)
  raised_by           TEXT              NOT NULL,

  -- Category and free-form description
  category            dispute_category  NOT NULL,
  description         TEXT              NOT NULL,

  -- Evidence: IPFS CID or signed URL of supporting document / photo
  evidence_url        TEXT,
  evidence_ipfs_cid   TEXT,

  -- Workflow state machine
  status              dispute_status    NOT NULL DEFAULT 'open',

  -- Stellar account of the admin / arbitrator handling this dispute
  assigned_to         TEXT,

  -- Resolution notes written by the arbitrator
  resolution_notes    TEXT,

  -- Stellar tx hash of any on-chain action taken to resolve (e.g. refund)
  resolution_tx_hash  TEXT              REFERENCES indexed_transactions (tx_hash),

  -- Timestamps
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);

-- Common query patterns
CREATE INDEX IF NOT EXISTS idx_disputes_tree        ON disputes (tree_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status      ON disputes (status);
CREATE INDEX IF NOT EXISTS idx_disputes_raised_by   ON disputes (raised_by);
CREATE INDEX IF NOT EXISTS idx_disputes_assigned    ON disputes (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_open        ON disputes (created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_disputes_category    ON disputes (category);
