-- Migration: 013_create_daily_challenges.sql
-- Issue #1158 — Daily challenges encouraging sponsors to engage: plant trees, sponsor rare species, earn bonus XLM.

-- Defines available daily challenge templates.
CREATE TABLE IF NOT EXISTS daily_challenges (
  id              BIGSERIAL PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  challenge_type  TEXT NOT NULL CHECK (challenge_type IN (
    'plant_trees',
    'sponsor_rare_species',
    'sponsor_new_region',
    'sponsor_consecutive_days',
    'sponsor_bulk',
    'referral',
    'carbon_milestone'
  )),
  target_value    INT NOT NULL DEFAULT 1,   -- e.g., number of trees to plant
  reward_xlm      NUMERIC(14, 6) NOT NULL DEFAULT 0,
  reward_nft      BOOLEAN NOT NULL DEFAULT FALSE,
  badge_id        TEXT,  -- references sponsor-badge tier if applicable
  species_slug    TEXT,  -- for species-specific challenges
  region          TEXT,  -- for region-specific challenges
  difficulty      TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard', 'epic')),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  start_date      DATE,
  end_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_challenges_active
  ON daily_challenges (active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_daily_challenges_type
  ON daily_challenges (challenge_type);

-- Tracks each sponsor's daily challenge assignment and progress.
CREATE TABLE IF NOT EXISTS sponsor_daily_challenges (
  id              BIGSERIAL PRIMARY KEY,
  wallet          TEXT NOT NULL,
  challenge_id    BIGINT NOT NULL REFERENCES daily_challenges (id) ON DELETE CASCADE,
  assigned_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  progress        INT NOT NULL DEFAULT 0,
  target          INT NOT NULL,  -- snapshot of challenge target_value
  status          TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'expired', 'claimed')),
  completed_at    TIMESTAMPTZ,
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wallet, challenge_id, assigned_date)
);

CREATE INDEX IF NOT EXISTS idx_sponsor_challenges_wallet_date
  ON sponsor_daily_challenges (wallet, assigned_date);
CREATE INDEX IF NOT EXISTS idx_sponsor_challenges_status
  ON sponsor_daily_challenges (status);

-- Records earned rewards from completed daily challenges.
CREATE TABLE IF NOT EXISTS challenge_rewards (
  id              BIGSERIAL PRIMARY KEY,
  wallet          TEXT NOT NULL,
  challenge_id    BIGINT NOT NULL REFERENCES daily_challenges (id) ON DELETE CASCADE,
  sponsor_challenge_id BIGINT NOT NULL REFERENCES sponsor_daily_challenges (id) ON DELETE CASCADE,
  reward_type     TEXT NOT NULL CHECK (reward_type IN ('xlm', 'nft', 'badge', 'multiplier')),
  reward_amount   NUMERIC(14, 6) NOT NULL DEFAULT 0,
  reward_description TEXT,
  tx_hash         TEXT,  -- for XLM payouts
  claimed         BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenge_rewards_wallet
  ON challenge_rewards (wallet);
CREATE INDEX IF NOT EXISTS idx_challenge_rewards_unclaimed
  ON challenge_rewards (wallet, claimed) WHERE claimed = FALSE;

-- Tracks consecutive-day streaks for streak-based challenges and bonuses.
CREATE TABLE IF NOT EXISTS sponsor_streaks (
  wallet          TEXT PRIMARY KEY,
  current_streak  INT NOT NULL DEFAULT 0,
  longest_streak  INT NOT NULL DEFAULT 0,
  last_active_date DATE,
  streak_multiplier NUMERIC(3, 2) NOT NULL DEFAULT 1.00,  -- bonus multiplier (1.0 = no bonus)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE daily_challenges IS 'Available daily challenge templates sponsors can complete for rewards.';
COMMENT ON TABLE sponsor_daily_challenges IS 'Per-sponsor daily challenge assignments and progress.';
COMMENT ON TABLE challenge_rewards IS 'Rewards earned from completed daily challenges.';
COMMENT ON TABLE sponsor_streaks IS 'Tracks consecutive-day sponsorship streaks for bonus multipliers.';
