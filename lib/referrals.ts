import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export const REFERRAL_REWARD_XLM = 1;
export const PLANTER_REFERRAL_REWARD_XLM = 2;
export const MAX_MONTHLY_REFERRAL_REWARDS = 10;
export const REFERRAL_BONUS_XLM = 5;

export type ReferralType = 'sponsor' | 'planter';

export interface RewardTier {
  level: string;
  threshold: number;
  rewardDescription: string;
}

export interface ReferralStats {
  referralLink: string;
  referralCode: string;
  referralsCount: number;
  totalEarnings: number;
  rewardsThisMonth: number;
  monthlyCap: number;
  tiers: RewardTier[];
  role?: ReferralType;
  rewardAmountXlm?: number;
  planterReferralsCount?: number;
  sponsorReferralsCount?: number;
}

export interface ReferralRewardResult {
  status: 'queued' | 'already_rewarded' | 'capped' | 'not_eligible';
  rewardId?: number;
  referrerWallet?: string;
  amountXlm: number;
  rewardType?: ReferralType;
}

export function getPlanterReferralUrl(
  planterId: string,
  baseUrl = 'https://stellarapp.io'
): string {
  return `${baseUrl.replace(/\/$/, '')}/donate?ref=${encodeURIComponent(planterId)}`;
}

export function getPlanterInviteUrl(
  code: string,
  baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://farmcredit.app'
): string {
  return `${baseUrl.replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}&role=planter`;
}

interface ReferralAttribution {
  planterId: string;
  sponsorId: string;
  transactionHash: string;
  bonusXlm: number;
}

const attributions = new Map<string, ReferralAttribution>();

export function recordReferralAttribution(
  planterId: string,
  sponsorId: string,
  transactionHash: string
): ReferralAttribution | null {
  const key = sponsorId.trim();
  if (!planterId.trim() || !key || !transactionHash.trim() || attributions.has(key)) return null;

  const attribution = {
    planterId: planterId.trim(),
    sponsorId: key,
    transactionHash: transactionHash.trim(),
    bonusXlm: REFERRAL_BONUS_XLM,
  };
  attributions.set(key, attribution);
  return attribution;
}

const REFERRAL_CODE_PATTERN = /^[a-z0-9_-]{8,64}$/i;
const STELLAR_ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;

export function isValidStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_PATTERN.test(address);
}

export function createReferralCode(referrerWallet: string): string {
  return `ref_${createHash('sha256').update(referrerWallet).digest('hex').slice(0, 16)}`;
}

export function isValidReferralCode(code: string): boolean {
  return REFERRAL_CODE_PATTERN.test(code);
}

export function getRewardTiers(): RewardTier[] {
  return [
    {
      level: 'Starter',
      threshold: 1,
      rewardDescription: 'Earn 1 XLM for each eligible referred sponsor.',
    },
    {
      level: 'Builder',
      threshold: 5,
      rewardDescription: 'Build your forest with up to five monthly rewards.',
    },
    {
      level: 'Champion',
      threshold: 10,
      rewardDescription: 'Reach the monthly maximum of ten 1 XLM rewards.',
    },
  ];
}

export function getPlanterRewardTiers(): RewardTier[] {
  return [
    {
      level: 'Starter Planter',
      threshold: 1,
      rewardDescription:
        'Earn 2 XLM for each eligible referred planter who completes their first job.',
    },
    {
      level: 'Community Leader',
      threshold: 5,
      rewardDescription: 'Grow your planting team with up to five monthly planter rewards.',
    },
    {
      level: 'Master Steward',
      threshold: 10,
      rewardDescription: 'Reach the monthly maximum of ten 2 XLM planter referral rewards.',
    },
  ];
}

export async function getOrCreateReferralCode(
  pool: Pick<Pool, 'query'>,
  referrerWallet: string
): Promise<string> {
  const existing = await pool.query<{ code: string }>(
    'SELECT code FROM referral_codes WHERE referrer_wallet = $1',
    [referrerWallet]
  );
  if (existing.rows[0]?.code) return existing.rows[0].code;

  const code = createReferralCode(referrerWallet);
  await pool.query(
    `INSERT INTO referral_codes (code, referrer_wallet)
     VALUES ($1, $2)
     ON CONFLICT (referrer_wallet) DO NOTHING`,
    [code, referrerWallet]
  );
  return code;
}

export async function getReferralStats(
  pool: Pick<Pool, 'query'>,
  referrerWallet: string,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://farmcredit.app',
  role?: ReferralType
): Promise<ReferralStats> {
  const code = await getOrCreateReferralCode(pool, referrerWallet);
  const result = await pool.query<{
    referrals_count: number;
    total_earnings: string | number;
    rewards_this_month: number;
    planter_referrals_count: number;
    sponsor_referrals_count: number;
  }>(
    `SELECT
       COUNT(r.id) FILTER (WHERE r.first_tree_completed_at IS NOT NULL OR r.first_job_completed_at IS NOT NULL)::int AS referrals_count,
       COUNT(r.id) FILTER (WHERE r.first_job_completed_at IS NOT NULL OR r.referral_type = 'planter')::int AS planter_referrals_count,
       COUNT(r.id) FILTER (WHERE r.first_tree_completed_at IS NOT NULL AND (r.first_job_completed_at IS NULL AND r.referral_type != 'planter'))::int AS sponsor_referrals_count,
       COALESCE(SUM(rr.amount_xlm) FILTER (WHERE rr.status IN ('queued', 'paid')), 0)::numeric AS total_earnings,
       COUNT(rr.id) FILTER (WHERE rr.period_start = date_trunc('month', CURRENT_DATE)::date)::int AS rewards_this_month
     FROM referral_codes c
     LEFT JOIN referral_signups r ON r.code = c.code
     LEFT JOIN referral_rewards rr ON rr.referral_id = r.id
     WHERE c.referrer_wallet = $1`,
    [referrerWallet]
  );
  const row = result.rows[0] ?? {
    referrals_count: 0,
    total_earnings: 0,
    rewards_this_month: 0,
    planter_referrals_count: 0,
    sponsor_referrals_count: 0,
  };

  const isPlanter = role === 'planter';
  return {
    referralLink: isPlanter
      ? getPlanterInviteUrl(code, siteUrl)
      : `${siteUrl.replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}`,
    referralCode: code,
    referralsCount: Number(row.referrals_count ?? 0),
    totalEarnings: Number(row.total_earnings ?? 0),
    rewardsThisMonth: Number(row.rewards_this_month ?? 0),
    monthlyCap: MAX_MONTHLY_REFERRAL_REWARDS,
    tiers: isPlanter ? getPlanterRewardTiers() : getRewardTiers(),
    role: isPlanter ? 'planter' : 'sponsor',
    rewardAmountXlm: isPlanter ? PLANTER_REFERRAL_REWARD_XLM : REFERRAL_REWARD_XLM,
    planterReferralsCount: Number(row.planter_referrals_count ?? 0),
    sponsorReferralsCount: Number(row.sponsor_referrals_count ?? 0),
  };
}

export async function registerReferral(
  pool: Pick<Pool, 'query'>,
  code: string,
  referredWallet: string,
  referralType: ReferralType = 'sponsor'
): Promise<void> {
  if (!isValidReferralCode(code)) throw new Error('Invalid referral code');
  if (!isValidStellarAddress(referredWallet)) throw new Error('Invalid referred wallet');

  const owner = await pool.query<{ referrer_wallet: string }>(
    'SELECT referrer_wallet FROM referral_codes WHERE code = $1',
    [code]
  );
  const referrerWallet = owner.rows[0]?.referrer_wallet;
  if (!referrerWallet) throw new Error('Referral code not found');
  if (referrerWallet === referredWallet) throw new Error('Self-referrals are not allowed');

  await pool.query(
    `INSERT INTO referral_signups (code, referred_wallet, referral_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (referred_wallet) DO NOTHING`,
    [code, referredWallet, referralType]
  );
}

export async function queueReferralReward(
  pool: Pool,
  referredWallet: string,
  treeRef: string
): Promise<ReferralRewardResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tree = await client.query<{ tree_ref: string }>(
      `SELECT tree_ref
       FROM trees
       WHERE tree_ref = $1
         AND sponsor_wallet = $2
         AND status = 'completed'
         AND deleted_at IS NULL`,
      [treeRef, referredWallet]
    );
    if (tree.rowCount === 0) {
      await client.query('ROLLBACK');
      return { status: 'not_eligible', amountXlm: REFERRAL_REWARD_XLM, rewardType: 'sponsor' };
    }

    const referral = await client.query<{
      id: number;
      referrer_wallet: string;
      first_tree_completed_at: string | null;
    }>(
      `SELECT r.id, c.referrer_wallet, r.first_tree_completed_at
       FROM referral_signups r
       JOIN referral_codes c ON c.code = r.code
       WHERE r.referred_wallet = $1
       FOR UPDATE`,
      [referredWallet]
    );
    const row = referral.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { status: 'not_eligible', amountXlm: REFERRAL_REWARD_XLM, rewardType: 'sponsor' };
    }
    if (row.first_tree_completed_at) {
      await client.query('ROLLBACK');
      return {
        status: 'already_rewarded',
        referrerWallet: row.referrer_wallet,
        amountXlm: REFERRAL_REWARD_XLM,
        rewardType: 'sponsor',
      };
    }

    // Serialize rewards for one referrer so concurrent first-tree completions
    // cannot both pass the ten-per-month cap check.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      row.referrer_wallet,
    ]);
    const cap = await client.query<{ reward_count: number }>(
      `SELECT COUNT(*)::int AS reward_count
       FROM referral_rewards
       WHERE referrer_wallet = $1
         AND period_start = date_trunc('month', CURRENT_DATE)::date`,
      [row.referrer_wallet]
    );
    if (Number(cap.rows[0]?.reward_count ?? 0) >= MAX_MONTHLY_REFERRAL_REWARDS) {
      await client.query('ROLLBACK');
      return {
        status: 'capped',
        referrerWallet: row.referrer_wallet,
        amountXlm: REFERRAL_REWARD_XLM,
        rewardType: 'sponsor',
      };
    }

    await client.query(
      `UPDATE referral_signups SET first_tree_completed_at = NOW() WHERE id = $1`,
      [row.id]
    );
    const reward = await client.query<{ id: number }>(
      `INSERT INTO referral_rewards
         (referral_id, referrer_wallet, amount_xlm, period_start, status, reward_type)
       VALUES ($1, $2, $3, date_trunc('month', CURRENT_DATE)::date, 'queued', 'sponsor')
       RETURNING id`,
      [row.id, row.referrer_wallet, REFERRAL_REWARD_XLM]
    );

    await client.query('COMMIT');
    return {
      status: 'queued',
      rewardId: reward.rows[0]?.id,
      referrerWallet: row.referrer_wallet,
      amountXlm: REFERRAL_REWARD_XLM,
      rewardType: 'sponsor',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Queue a 2 XLM referral reward for the planter who referred a new planter once
 * the referred planter completes their first job / tree planting.
 */
export async function queuePlanterReferralReward(
  pool: Pool,
  referredPlanterWallet: string,
  jobRef: string
): Promise<ReferralRewardResult> {
  if (!isValidStellarAddress(referredPlanterWallet)) {
    return {
      status: 'not_eligible',
      amountXlm: PLANTER_REFERRAL_REWARD_XLM,
      rewardType: 'planter',
    };
  }
  if (!jobRef?.trim()) {
    return {
      status: 'not_eligible',
      amountXlm: PLANTER_REFERRAL_REWARD_XLM,
      rewardType: 'planter',
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify the job was completed by this planter.
    // Checks trees table where tree_ref or id matches, and planter owns it via
    // planter_wallet or through the planters table (p.stellar_address).
    const job = await client.query<{ tree_ref: string }>(
      `SELECT t.tree_ref
       FROM trees t
       LEFT JOIN planters p ON p.id = t.planter_id
       WHERE (t.tree_ref = $1 OR t.id::text = $1)
         AND (t.planter_wallet = $2 OR p.stellar_address = $2)
         AND t.status IN ('completed', 'verified')
         AND t.deleted_at IS NULL`,
      [jobRef.trim(), referredPlanterWallet]
    );
    if (job.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        status: 'not_eligible',
        amountXlm: PLANTER_REFERRAL_REWARD_XLM,
        rewardType: 'planter',
      };
    }

    const referral = await client.query<{
      id: number;
      referrer_wallet: string;
      first_job_completed_at: string | null;
      first_tree_completed_at: string | null;
    }>(
      `SELECT r.id, c.referrer_wallet, r.first_job_completed_at, r.first_tree_completed_at
       FROM referral_signups r
       JOIN referral_codes c ON c.code = r.code
       WHERE r.referred_wallet = $1
       FOR UPDATE`,
      [referredPlanterWallet]
    );
    const row = referral.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return {
        status: 'not_eligible',
        amountXlm: PLANTER_REFERRAL_REWARD_XLM,
        rewardType: 'planter',
      };
    }
    if (row.first_job_completed_at) {
      await client.query('ROLLBACK');
      return {
        status: 'already_rewarded',
        referrerWallet: row.referrer_wallet,
        amountXlm: PLANTER_REFERRAL_REWARD_XLM,
        rewardType: 'planter',
      };
    }

    // Serialize rewards for one referrer so concurrent completions cannot bypass the monthly cap.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      row.referrer_wallet,
    ]);
    const cap = await client.query<{ reward_count: number }>(
      `SELECT COUNT(*)::int AS reward_count
       FROM referral_rewards
       WHERE referrer_wallet = $1
         AND period_start = date_trunc('month', CURRENT_DATE)::date`,
      [row.referrer_wallet]
    );
    if (Number(cap.rows[0]?.reward_count ?? 0) >= MAX_MONTHLY_REFERRAL_REWARDS) {
      await client.query('ROLLBACK');
      return {
        status: 'capped',
        referrerWallet: row.referrer_wallet,
        amountXlm: PLANTER_REFERRAL_REWARD_XLM,
        rewardType: 'planter',
      };
    }

    await client.query(
      `UPDATE referral_signups
       SET first_job_completed_at = NOW(),
           first_tree_completed_at = COALESCE(first_tree_completed_at, NOW())
       WHERE id = $1`,
      [row.id]
    );
    const reward = await client.query<{ id: number }>(
      `INSERT INTO referral_rewards
         (referral_id, referrer_wallet, amount_xlm, period_start, status, reward_type, job_ref)
       VALUES ($1, $2, $3, date_trunc('month', CURRENT_DATE)::date, 'queued', 'planter', $4)
       RETURNING id`,
      [row.id, row.referrer_wallet, PLANTER_REFERRAL_REWARD_XLM, jobRef.trim()]
    );

    await client.query('COMMIT');
    return {
      status: 'queued',
      rewardId: reward.rows[0]?.id,
      referrerWallet: row.referrer_wallet,
      amountXlm: PLANTER_REFERRAL_REWARD_XLM,
      rewardType: 'planter',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type ReferralDbClient = Pick<PoolClient, 'query'>;

// Kept for existing demo consumers until they migrate to the API-backed hook.
export function getMockReferralStats(role: ReferralType = 'sponsor'): ReferralStats {
  const code = 'ref_demo_2026';
  const isPlanter = role === 'planter';
  return {
    referralLink: isPlanter
      ? `https://farmcredit.app/?ref=${code}&role=planter`
      : `https://farmcredit.app/?ref=${code}`,
    referralCode: code,
    referralsCount: 0,
    totalEarnings: 0,
    rewardsThisMonth: 0,
    monthlyCap: MAX_MONTHLY_REFERRAL_REWARDS,
    tiers: isPlanter ? getPlanterRewardTiers() : getRewardTiers(),
    role,
    rewardAmountXlm: isPlanter ? PLANTER_REFERRAL_REWARD_XLM : REFERRAL_REWARD_XLM,
    planterReferralsCount: 0,
    sponsorReferralsCount: 0,
  };
}
