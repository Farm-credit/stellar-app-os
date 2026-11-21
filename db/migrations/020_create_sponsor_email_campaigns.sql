-- Sponsor email automation for issues #1110 and #1117.
BEGIN;

-- One durable row per sponsor and reporting period. The existing worker sends
-- pending rows; this migration adds the generation-side indexes and retry data.
ALTER TABLE email_digests
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_email_digests_period
  ON email_digests (digest_type, generated_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         TEXT NOT NULL,
  message         TEXT NOT NULL,
  segments        JSONB NOT NULL DEFAULT '[]'::jsonb,
  region          TEXT,
  status          TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  last_error      TEXT
);

CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  id           BIGSERIAL PRIMARY KEY,
  campaign_id  UUID NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  name         TEXT NOT NULL DEFAULT 'Sponsor',
  segment      TEXT NOT NULL,
  region       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_pending
  ON newsletter_deliveries (campaign_id, status, id);
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_status
  ON newsletter_campaigns (status, created_at);

COMMIT;
