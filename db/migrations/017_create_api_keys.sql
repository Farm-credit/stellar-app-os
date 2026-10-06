BEGIN;

-- API keys used to authenticate and tier-rate-limit external API clients.
--
-- The full key is only ever stored hashed; only a short readable prefix is
-- stored in plaintext so operators can identify which application a key
-- belongs to without exposing the secret.

CREATE TABLE IF NOT EXISTS api_keys (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  prefix        TEXT        NOT NULL,
  key_hash      TEXT        NOT NULL UNIQUE,
  tier          TEXT        NOT NULL DEFAULT 'free'
                CHECK (tier IN ('free', 'standard', 'premium')),
  owner_wallet  TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_owner   ON api_keys (owner_wallet);
CREATE INDEX IF NOT EXISTS idx_api_keys_active  ON api_keys (is_active);

-- Rolling hourly usage accounting for tiered rate limits and request queuing.
-- Relevant for the "free" and "standard" tiers which have a finite hourly cap.
CREATE TABLE IF NOT EXISTS api_key_usage (
  id         BIGSERIAL PRIMARY KEY,
  api_key_id BIGINT       NOT NULL REFERENCES api_keys (id) ON DELETE CASCADE,
  window_ms  BIGINT       NOT NULL,
  count      INTEGER      NOT NULL DEFAULT 0,
  queued     INTEGER      NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (api_key_id, window_ms)
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key   ON api_key_usage (api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_window ON api_key_usage (window_ms);

COMMIT;
