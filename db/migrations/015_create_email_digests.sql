-- Migration 012: Email digests table (Issue #1176)
-- Stores pending/sent/failed email digest jobs for the email digest worker.

BEGIN;

CREATE TABLE IF NOT EXISTS email_digests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  user_email    VARCHAR(255) NOT NULL,
  digest_type   VARCHAR(10) NOT NULL CHECK (digest_type IN ('daily', 'weekly', 'monthly')),
  status        VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  tree_count    INT NOT NULL DEFAULT 0,
  total_co2_kg  REAL NOT NULL DEFAULT 0,
  new_updates   INT NOT NULL DEFAULT 0,
  top_species   VARCHAR(100) DEFAULT 'Unknown',
  error_count   INT NOT NULL DEFAULT 0,
  last_error    TEXT,
  last_error_at TIMESTAMPTZ,
  sponsor_timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  scheduled_for TIMESTAMPTZ,
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

-- Index for the hourly worker: select due digests by status and scheduled send time
CREATE INDEX IF NOT EXISTS idx_email_digests_due
  ON email_digests(status, scheduled_for);

-- Unique constraint to prevent duplicate digests per user per period
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_digests_unique_per_user
  ON email_digests(user_id, digest_type, date_trunc('week', generated_at))
  WHERE status IN ('pending', 'processing', 'sent');

-- Idempotently extend an existing table (from migration 012) with the new columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_digests' AND column_name = 'sponsor_timezone'
  ) THEN
    ALTER TABLE email_digests
      ADD COLUMN sponsor_timezone VARCHAR(64) NOT NULL DEFAULT 'UTC';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_digests' AND column_name = 'scheduled_for'
  ) THEN
    ALTER TABLE email_digests
      ADD COLUMN scheduled_for TIMESTAMPTZ;
  END IF;
END $$;

-- Idempotently widen the digest_type CHECK constraint to allow 'daily'
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'email_digests'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%digest_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_digests DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE email_digests
    ADD CONSTRAINT email_digests_digest_type_check
    CHECK (digest_type IN ('daily', 'weekly', 'monthly'));
END $$;

COMMIT;
