import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export const REFERRAL_REWARD_XLM = 1;
export const MAX_MONTHLY_REFERRAL_REWARDS = 10;

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
}

export interface ReferralRewardResult {
  status: 'queued' | 'already_rewarded' | 'capped' | 'not_eligible';
  rewardId?: number;
  referrerWallet?: string;
  amountXlm: number;
}
export const REFERRAL_BONUS_XLM = 5;

export function getPlanterReferralUrl(
  planterId: string,
  baseUrl = 'https://stellarapp.io'
): string {
  return `${baseUrl.replace(/\/$/, '')}/donate?ref=${encodeURIComponent(planterId)}`;
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

// Replace with your real API call when the backend is ready
export async function getReferralStats(): Promise<ReferralStats> {
  const res = await fetch('/api/referrals');

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
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://farmcredit.app'
): Promise<ReferralStats> {
  const code = await getOrCreateReferralCode(pool, referrerWallet);
  const result = await pool.query<{
    referrals_count: number;
    total_earnings: string | number;
    rewards_this_month: number;
  }>(
    `SELECT
       COUNT(r.id) FILTER (WHERE r.first_tree_completed_at IS NOT NULL)::int AS referrals_count,
       COALESCE(SUM(rr.amount_xlm) FILTER (WHERE rr.status IN ('queued', 'paid')), 0)::numeric AS total_earnings,
       COUNT(rr.id) FILTER (WHERE rr.period_start = date_trunc('month', CURRENT_DATE)::date)::int AS rewards_this_month
     FROM referral_codes c
     LEFT JOIN referral_signups r ON r.code = c.code
     LEFT JOIN referral_rewards rr ON rr.referral_id = r.id
     WHERE c.referrer_wallet = $1`,
    [referrerWallet]
  );
  const row = result.rows[0] ?? { referrals_count: 0, total_earnings: 0, rewards_this_month: 0 };

  return {
    referralLink: `${siteUrl.replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}`,
    referralCode: code,
    referralsCount: Number(row.referrals_count ?? 0),
    totalEarnings: Number(row.total_earnings ?? 0),
    rewardsThisMonth: Number(row.rewards_this_month ?? 0),
    monthlyCap: MAX_MONTHLY_REFERRAL_REWARDS,
    tiers: getRewardTiers(),
  };
}

export async function registerReferral(
  pool: Pick<Pool, 'query'>,
  code: string,
  referredWallet: string
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
    `INSERT INTO referral_signups (code, referred_wallet)
     VALUES ($1, $2)
     ON CONFLICT (referred_wallet) DO NOTHING`,
    [code, referredWallet]
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
      return { status: 'not_eligible', amountXlm: REFERRAL_REWARD_XLM };
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
      return { status: 'not_eligible', amountXlm: REFERRAL_REWARD_XLM };
    }
    if (row.first_tree_completed_at) {
      await client.query('ROLLBACK');
      return {
        status: 'already_rewarded',
        referrerWallet: row.referrer_wallet,
        amountXlm: REFERRAL_REWARD_XLM,
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
      };
    }

    await client.query(
      `UPDATE referral_signups SET first_tree_completed_at = NOW() WHERE id = $1`,
      [row.id]
    );
    const reward = await client.query<{ id: number }>(
      `INSERT INTO referral_rewards
         (referral_id, referrer_wallet, amount_xlm, period_start, status)
       VALUES ($1, $2, $3, date_trunc('month', CURRENT_DATE)::date, 'queued')
       RETURNING id`,
      [row.id, row.referrer_wallet, REFERRAL_REWARD_XLM]
    );

    await client.query('COMMIT');
    return {
      status: 'queued',
      rewardId: reward.rows[0]?.id,
      referrerWallet: row.referrer_wallet,
      amountXlm: REFERRAL_REWARD_XLM,
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
export function getMockReferralStats(): ReferralStats {
  const code = 'ref_demo_2026';
  return {
    referralLink: `https://farmcredit.app/?ref=${code}`,
    referralCode: code,
    referralsCount: 0,
    totalEarnings: 0,
    rewardsThisMonth: 0,
    monthlyCap: MAX_MONTHLY_REFERRAL_REWARDS,
    tiers: getRewardTiers(),
  };
}
