import { describe, expect, it, vi } from 'vitest';
import {
  createReferralCode,
  getPlanterInviteUrl,
  getPlanterRewardTiers,
  getReferralStats,
  getRewardTiers,
  isValidReferralCode,
  isValidStellarAddress,
  PLANTER_REFERRAL_REWARD_XLM,
  REFERRAL_REWARD_XLM,
  queuePlanterReferralReward,
  queueReferralReward,
  registerReferral,
} from '@/lib/referrals';

const referrer = `G${'A'.repeat(55)}`;
const referred = `G${'B'.repeat(55)}`;
const referredPlanter = `G${'C'.repeat(55)}`;

describe('referral rewards', () => {
  it('creates deterministic codes and validates Stellar addresses', () => {
    expect(createReferralCode(referrer)).toBe(createReferralCode(referrer));
    expect(createReferralCode(referrer)).toMatch(/^ref_[a-f0-9]{16}$/);
    expect(isValidReferralCode('ref_12345678')).toBe(true);
    expect(isValidReferralCode('invalid')).toBe(false);
    expect(isValidStellarAddress(referrer)).toBe(true);
    expect(isValidStellarAddress('not-a-wallet')).toBe(false);
    expect(getRewardTiers().at(-1)?.threshold).toBe(10);
    expect(getPlanterRewardTiers().at(-1)?.threshold).toBe(10);
    expect(PLANTER_REFERRAL_REWARD_XLM).toBe(2);
    expect(REFERRAL_REWARD_XLM).toBe(1);
  });

  it('rejects unknown codes and self-referrals', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query };

    await expect(registerReferral(pool, 'ref_unknown', referred)).rejects.toThrow(
      'Referral code not found'
    );

    query.mockResolvedValueOnce({ rows: [{ referrer_wallet: referrer }] });
    await expect(registerReferral(pool, 'ref_known_123', referrer)).rejects.toThrow(
      'Self-referrals are not allowed'
    );
  });

  it('registers a planter referral with role', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ referrer_wallet: referrer }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const pool = { query };

    await registerReferral(pool, 'ref_planter_123', referredPlanter, 'planter');

    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO referral_signups'),
      ['ref_planter_123', referredPlanter, 'planter']
    );
  });

  it('queues exactly one reward after a completed first tree for a sponsor (1 XLM)', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ tree_ref: 'TREE-001' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 7, referrer_wallet: referrer, first_tree_completed_at: null }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ reward_count: 0 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 11 }] })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    const result = await queueReferralReward(pool as never, referred, 'TREE-001');

    expect(result).toEqual({
      status: 'queued',
      rewardId: 11,
      referrerWallet: referrer,
      amountXlm: 1,
      rewardType: 'sponsor',
    });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('does not queue a reward for an incomplete tree', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    const result = await queueReferralReward(pool as never, referred, 'TREE-001');

    expect(result.status).toBe('not_eligible');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  describe('planter referral rewards (2 XLM)', () => {
    it('queues a 2 XLM reward when referred planter completes their first job', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rowCount: 1, rows: [{ tree_ref: 'JOB-2026-001' }] }) // Job verified
          .mockResolvedValueOnce({
            rows: [
              {
                id: 42,
                referrer_wallet: referrer,
                first_job_completed_at: null,
                first_tree_completed_at: null,
              },
            ],
          }) // referral lookup
          .mockResolvedValueOnce({}) // advisory lock
          .mockResolvedValueOnce({ rows: [{ reward_count: 2 }] }) // cap check
          .mockResolvedValueOnce({}) // update referral_signups
          .mockResolvedValueOnce({ rows: [{ id: 108 }] }) // insert reward
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const result = await queuePlanterReferralReward(
        pool as never,
        referredPlanter,
        'JOB-2026-001'
      );

      expect(result).toEqual({
        status: 'queued',
        rewardId: 108,
        referrerWallet: referrer,
        amountXlm: 2,
        rewardType: 'planter',
      });
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalledOnce();
    });

    it('prevents duplicate rewards for subsequent completed jobs by the same planter', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rowCount: 1, rows: [{ tree_ref: 'JOB-2026-002' }] }) // Job verified
          .mockResolvedValueOnce({
            rows: [
              {
                id: 42,
                referrer_wallet: referrer,
                first_job_completed_at: '2026-08-01T12:00:00Z',
                first_tree_completed_at: '2026-08-01T12:00:00Z',
              },
            ],
          }) // already rewarded
          .mockResolvedValueOnce({}), // ROLLBACK
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const result = await queuePlanterReferralReward(
        pool as never,
        referredPlanter,
        'JOB-2026-002'
      );

      expect(result).toEqual({
        status: 'already_rewarded',
        referrerWallet: referrer,
        amountXlm: 2,
        rewardType: 'planter',
      });
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalledOnce();
    });

    it('rejects reward when job is not completed or does not belong to the planter', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // no matching completed job
          .mockResolvedValueOnce({}), // ROLLBACK
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const result = await queuePlanterReferralReward(
        pool as never,
        referredPlanter,
        'JOB-UNKNOWN'
      );

      expect(result).toEqual({
        status: 'not_eligible',
        amountXlm: 2,
        rewardType: 'planter',
      });
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalledOnce();
    });

    it('enforces the monthly cap of 10 rewards per calendar month for planters', async () => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rowCount: 1, rows: [{ tree_ref: 'JOB-CAP' }] }) // Job verified
          .mockResolvedValueOnce({
            rows: [
              {
                id: 43,
                referrer_wallet: referrer,
                first_job_completed_at: null,
                first_tree_completed_at: null,
              },
            ],
          }) // referral lookup
          .mockResolvedValueOnce({}) // advisory lock
          .mockResolvedValueOnce({ rows: [{ reward_count: 10 }] }) // at cap!
          .mockResolvedValueOnce({}), // ROLLBACK
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const result = await queuePlanterReferralReward(pool as never, referredPlanter, 'JOB-CAP');

      expect(result).toEqual({
        status: 'capped',
        referrerWallet: referrer,
        amountXlm: 2,
        rewardType: 'planter',
      });
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalledOnce();
    });

    it('validates invalid wallet and job ref inputs immediately without hitting db', async () => {
      const pool = { connect: vi.fn() };

      const res1 = await queuePlanterReferralReward(pool as never, 'invalid-wallet', 'JOB-1');
      expect(res1.status).toBe('not_eligible');
      expect(res1.amountXlm).toBe(2);

      const res2 = await queuePlanterReferralReward(pool as never, referredPlanter, '');
      expect(res2.status).toBe('not_eligible');
      expect(res2.amountXlm).toBe(2);

      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('generates planter invite url with role query parameter', () => {
      const inviteUrl = getPlanterInviteUrl('ref_planter_xyz', 'https://farmcredit.app');
      expect(inviteUrl).toBe('https://farmcredit.app/?ref=ref_planter_xyz&role=planter');
    });

    it('returns planter-specific stats when requested with role=planter', async () => {
      const query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ code: 'ref_planter_code' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              referrals_count: 3,
              planter_referrals_count: 3,
              sponsor_referrals_count: 0,
              total_earnings: 6,
              rewards_this_month: 3,
            },
          ],
        });
      const pool = { query };

      const stats = await getReferralStats(
        pool,
        referrer,
        'https://farmcredit.app',
        'planter'
      );

      expect(stats.role).toBe('planter');
      expect(stats.rewardAmountXlm).toBe(2);
      expect(stats.referralLink).toContain('&role=planter');
      expect(stats.tiers[0].rewardDescription).toContain('2 XLM');
      expect(stats.totalEarnings).toBe(6);
    });
  });
});
