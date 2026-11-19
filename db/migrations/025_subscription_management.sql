-- 025: Subscription self-service controls (Drips issue #1655)

ALTER TABLE sponsorship_subscriptions
  ADD COLUMN IF NOT EXISTS pause_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS species_preference TEXT;

CREATE INDEX IF NOT EXISTS idx_sponsorship_subscriptions_pause_until
  ON sponsorship_subscriptions (pause_until)
  WHERE status = 'paused';
