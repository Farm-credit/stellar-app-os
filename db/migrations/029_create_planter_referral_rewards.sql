-- Migration: 029_create_planter_referral_rewards.sql
-- Issue #1015 — Planter referral rewards.
--
-- Planters earn 2 XLM per referred planter who completes their first job.
-- Rewards are queued for the treasury payout worker; this migration never stores
-- private keys or attempts an on-chain transfer.

-- 1. Ensure trees can track planter wallet directly for referral attribution
ALTER TABLE trees ADD COLUMN IF NOT EXISTS planter_wallet TEXT;
CREATE INDEX IF NOT EXISTS idx_trees_planter_wallet ON trees (planter_wallet);

-- 2. Extend referral_signups to support referral type and first job completion tracking
ALTER TABLE referral_signups ADD COLUMN IF NOT EXISTS referral_type TEXT NOT NULL DEFAULT 'sponsor';
ALTER TABLE referral_signups ADD COLUMN IF NOT EXISTS first_job_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_referral_signups_job_completed
  ON referral_signups (first_job_completed_at)
  WHERE first_job_completed_at IS NOT NULL;

-- 3. Update referral_rewards to allow 2 XLM rewards (and future amounts)
ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_amount_xlm_check;
ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_amount_xlm_check CHECK (amount_xlm > 0);

-- 4. Add reward_type and job_ref to referral_rewards for auditability
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS reward_type TEXT NOT NULL DEFAULT 'sponsor';
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS job_ref TEXT;
