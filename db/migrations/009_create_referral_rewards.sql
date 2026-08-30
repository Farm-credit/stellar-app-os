-- Migration: 009_create_referral_rewards.sql
-- Issue #1014 — sponsor referral rewards.
--
-- A referral is eligible exactly once: when the referred sponsor's first tree
-- reaches completed status. Rewards are queued for the treasury payout worker;
-- this migration never stores private keys or attempts an on-chain transfer.

ALTER TABLE trees ADD COLUMN IF NOT EXISTS sponsor_wallet TEXT;
CREATE INDEX IF NOT EXISTS idx_trees_sponsor_wallet ON trees (sponsor_wallet);

CREATE TABLE IF NOT EXISTS referral_codes (
  code              TEXT PRIMARY KEY,
  referrer_wallet   TEXT NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_signups (
  id                         BIGSERIAL PRIMARY KEY,
  code                       TEXT NOT NULL REFERENCES referral_codes (code) ON DELETE RESTRICT,
  referred_wallet            TEXT NOT NULL UNIQUE,
  first_tree_completed_at    TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_signups_code ON referral_signups (code);
CREATE INDEX IF NOT EXISTS idx_referral_signups_completed
  ON referral_signups (first_tree_completed_at)
  WHERE first_tree_completed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS referral_rewards (
  id                BIGSERIAL PRIMARY KEY,
  referral_id       BIGINT NOT NULL UNIQUE REFERENCES referral_signups (id) ON DELETE RESTRICT,
  referrer_wallet   TEXT NOT NULL,
  amount_xlm        NUMERIC(20, 7) NOT NULL DEFAULT 1
    CHECK (amount_xlm = 1),
  period_start      DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'paid', 'failed')),
  payout_tx_hash    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_wallet_period
  ON referral_rewards (referrer_wallet, period_start);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status
  ON referral_rewards (status);
