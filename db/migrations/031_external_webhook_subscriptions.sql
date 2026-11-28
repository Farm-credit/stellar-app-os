-- Migration: 031_external_webhook_subscriptions.sql
--
-- Extends the webhook dispatch schema (migration 007) to support external
-- non-planter system subscriptions, UUID public IDs, encrypted secrets with
-- rotation grace windows, API-key scopes, and delivery health / circuit-breaker
-- tracking.

BEGIN;

ALTER TABLE webhook_subscriptions
  ALTER COLUMN planter_id DROP NOT NULL,
  ALTER COLUMN secret DROP NOT NULL;

ALTER TABLE webhook_subscriptions
  ADD COLUMN IF NOT EXISTS public_id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_id                  TEXT,
  ADD COLUMN IF NOT EXISTS api_key_id                 BIGINT REFERENCES api_keys (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_wallet               TEXT,
  ADD COLUMN IF NOT EXISTS description                TEXT,
  ADD COLUMN IF NOT EXISTS secret_encrypted           TEXT,
  ADD COLUMN IF NOT EXISTS secret_last_four           CHAR(4),
  ADD COLUMN IF NOT EXISTS secret_rotated_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previous_secret_encrypted  TEXT,
  ADD COLUMN IF NOT EXISTS previous_secret_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consecutive_failures       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_delivery_status       webhook_delivery_status,
  ADD COLUMN IF NOT EXISTS disabled_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disabled_reason            TEXT;

DO $$ BEGIN
  ALTER TABLE webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_public_id_key UNIQUE (public_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_owner_check CHECK (
      planter_id IS NOT NULL
      OR client_id IS NOT NULL
      OR api_key_id IS NOT NULL
      OR owner_wallet IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY['webhooks:read', 'webhooks:write'];

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS failed_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_webhook_subs_public_id
  ON webhook_subscriptions (public_id);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_client
  ON webhook_subscriptions (client_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_subs_api_key
  ON webhook_subscriptions (api_key_id)
  WHERE deleted_at IS NULL;

COMMIT;
