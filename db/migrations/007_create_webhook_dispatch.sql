-- Migration: 007_create_webhook_dispatch.sql
--
-- Outward webhook notification system. When a milestone payout is approved
-- on-chain, the platform dispatches a signed HTTP POST to each planter's
-- registered backend ("subscription"). Every attempt is recorded as a
-- "delivery" row so failures can be retried with exponential backoff and
-- inspected from the admin webhook viewer.

-- UP ─────────────────────────────────────────────────────────────────────────

-- Delivery lifecycle:
--   pending   → never attempted yet (just enqueued)
--   retrying  → last attempt failed, next_attempt_at is scheduled
--   success   → endpoint returned 2xx
--   failed    → all attempts exhausted without success
CREATE TYPE webhook_delivery_status AS ENUM (
  'pending',
  'retrying',
  'success',
  'failed'
);

-- A planter backend that wants to receive outward notifications.
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  -- Internal surrogate key
  id            BIGSERIAL    PRIMARY KEY,

  -- The planter that owns this backend integration
  planter_id    BIGINT       NOT NULL REFERENCES planters (id) ON DELETE CASCADE,

  -- Destination URL the signed POST is sent to (https in production)
  url           TEXT         NOT NULL,

  -- Per-subscription HMAC signing secret. The planter uses this to verify the
  -- X-Webhook-Signature header on every request. Generated at registration.
  secret        TEXT         NOT NULL,

  -- Event types this subscription wants. Empty array = all events.
  -- e.g. {'milestone.payout.approved'}
  event_types   TEXT[]       NOT NULL DEFAULT '{}',

  -- Disabled subscriptions are skipped by the dispatcher
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,

  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- One row per (subscription, event) delivery, including every retry's outcome.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  -- Internal surrogate key
  id               BIGSERIAL                PRIMARY KEY,

  -- Stable public id shared with the planter (sent as X-Webhook-Id). Lets the
  -- receiver deduplicate retries of the same logical event.
  event_id         UUID                     NOT NULL DEFAULT gen_random_uuid(),

  -- The subscription this delivery targets
  subscription_id  BIGINT                   NOT NULL REFERENCES webhook_subscriptions (id) ON DELETE CASCADE,

  -- Logical event name, e.g. 'milestone.payout.approved'
  event_type       TEXT                     NOT NULL,

  -- The exact JSON body that was (or will be) signed and POSTed
  payload          JSONB                    NOT NULL,

  -- Delivery state machine
  status           webhook_delivery_status  NOT NULL DEFAULT 'pending',

  -- Last response observed
  http_status      INTEGER,
  response_body    TEXT,
  error_message    TEXT,

  -- Retry accounting
  attempt_count    INTEGER                  NOT NULL DEFAULT 0,
  max_attempts     INTEGER                  NOT NULL DEFAULT 6,

  -- When the next retry becomes eligible (NULL once terminal)
  next_attempt_at  TIMESTAMPTZ,

  -- When a 2xx was first received
  delivered_at     TIMESTAMPTZ,

  created_at       TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);

-- Common query patterns
CREATE INDEX IF NOT EXISTS idx_webhook_subs_planter
  ON webhook_subscriptions (planter_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_active
  ON webhook_subscriptions (is_active) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription
  ON webhook_deliveries (subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
  ON webhook_deliveries (status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event
  ON webhook_deliveries (event_id);
-- The dispatcher's hot path: find deliveries that are due for a retry.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
  ON webhook_deliveries (next_attempt_at)
  WHERE status = 'retrying';
