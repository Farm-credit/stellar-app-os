import { describe, expect, it, vi } from 'vitest';
import {
  createReferralCode,
  getRewardTiers,
  isValidStellarAddress,
  queueReferralReward,
  registerReferral,
} from '@/lib/referrals';

const referrer = `G${'A'.repeat(55)}`;
const referred = `G${'B'.repeat(55)}`;

describe('referral rewards', () => {
  it('creates deterministic codes and validates Stellar addresses', () => {
    expect(createReferralCode(referrer)).toBe(createReferralCode(referrer));
    expect(createReferralCode(referrer)).toMatch(/^ref_[a-f0-9]{16}$/);
    expect(isValidStellarAddress(referrer)).toBe(true);
    expect(isValidStellarAddress('not-a-wallet')).toBe(false);
    expect(getRewardTiers().at(-1)?.threshold).toBe(10);
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

  it('queues exactly one reward after a completed first tree', async () => {
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
});
