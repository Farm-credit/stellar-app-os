-- Rollback: 031_external_webhook_subscriptions_rollback.sql

BEGIN;

DROP INDEX IF EXISTS idx_webhook_subs_api_key;
DROP INDEX IF EXISTS idx_webhook_subs_client;
DROP INDEX IF EXISTS idx_webhook_subs_public_id;

ALTER TABLE webhook_deliveries
  DROP COLUMN IF EXISTS failed_at,
  DROP COLUMN IF EXISTS duration_ms;

ALTER TABLE api_keys
  DROP COLUMN IF EXISTS scopes;

ALTER TABLE webhook_subscriptions
  DROP CONSTRAINT IF EXISTS webhook_subscriptions_owner_check,
  DROP CONSTRAINT IF EXISTS webhook_subscriptions_public_id_key;

ALTER TABLE webhook_subscriptions
  DROP COLUMN IF EXISTS disabled_reason,
  DROP COLUMN IF EXISTS disabled_at,
  DROP COLUMN IF EXISTS last_delivery_status,
  DROP COLUMN IF EXISTS last_delivery_at,
  DROP COLUMN IF EXISTS consecutive_failures,
  DROP COLUMN IF EXISTS previous_secret_expires_at,
  DROP COLUMN IF EXISTS previous_secret_encrypted,
  DROP COLUMN IF EXISTS secret_rotated_at,
  DROP COLUMN IF EXISTS secret_last_four,
  DROP COLUMN IF EXISTS secret_encrypted,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS owner_wallet,
  DROP COLUMN IF EXISTS api_key_id,
  DROP COLUMN IF EXISTS client_id,
  DROP COLUMN IF EXISTS public_id;

COMMIT;
