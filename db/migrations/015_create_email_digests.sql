-- Migration 012: Email digests table (Issue #1176)
-- Stores pending/sent/failed email digest jobs for the email digest worker.

BEGIN;

CREATE TABLE IF NOT EXISTS email_digests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  user_email    VARCHAR(255) NOT NULL,
  digest_type   VARCHAR(10) NOT NULL CHECK (digest_type IN ('weekly', 'monthly')),
  status        VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  tree_count    INT NOT NULL DEFAULT 0,
  total_co2_kg  REAL NOT NULL DEFAULT 0,
  new_updates   INT NOT NULL DEFAULT 0,
  top_species   VARCHAR(100) DEFAULT 'Unknown',
  error_count   INT NOT NULL DEFAULT 0,
  last_error    TEXT,
  last_error_at TIMESTAMPTZ,
  generated_at  TIMESTAMPTZ DEFAULT now(),
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Index for the worker's primary query: fetch pending digests oldest-first
CREATE INDEX IF NOT EXISTS idx_email_digests_pending
  ON email_digests(generated_at)
  WHERE status = 'pending';

-- Index for status lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_email_digests_status
  ON email_digests(status);

-- Unique constraint to prevent duplicate digests per user per period
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_digests_unique_per_user
  ON email_digests(user_id, digest_type, date_trunc('week', generated_at))
  WHERE status IN ('pending', 'processing', 'sent');

COMMIT;
