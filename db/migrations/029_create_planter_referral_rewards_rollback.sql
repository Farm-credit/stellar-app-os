-- Rollback: 029_create_planter_referral_rewards_rollback.sql
-- Reverts Issue #1015 planter referral reward migration.

DROP INDEX IF EXISTS idx_referral_signups_job_completed;
DROP INDEX IF EXISTS idx_trees_planter_wallet;

ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_amount_xlm_check;
ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_amount_xlm_check CHECK (amount_xlm = 1);

ALTER TABLE referral_rewards DROP COLUMN IF EXISTS job_ref;
ALTER TABLE referral_rewards DROP COLUMN IF EXISTS reward_type;

ALTER TABLE referral_signups DROP COLUMN IF EXISTS first_job_completed_at;
ALTER TABLE referral_signups DROP COLUMN IF EXISTS referral_type;

ALTER TABLE trees DROP COLUMN IF EXISTS planter_wallet;
