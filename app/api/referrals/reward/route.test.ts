import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = (vi as unknown as { hoisted?: <T>(fn: () => T) => T }).hoisted ?? ((fn) => fn());

const { queueReferralReward, queuePlanterReferralReward, isValidStellarAddress, getPool } =
  hoisted(() => ({
    queueReferralReward: vi.fn(),
    queuePlanterReferralReward: vi.fn(),
    isValidStellarAddress: vi.fn(),
    getPool: vi.fn().mockReturnValue({}),
  }));

vi.mock('@/lib/referrals', () => ({
  queueReferralReward,
  queuePlanterReferralReward,
  isValidStellarAddress,
}));

vi.mock('@/lib/db/client', () => ({
  getPool,
}));

import { POST } from './route';

const referrer = `G${'A'.repeat(55)}`;
const referred = `G${'B'.repeat(55)}`;

describe('POST /api/referrals/reward', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isValidStellarAddress.mockImplementation((addr: string) => addr.startsWith('G') && addr.length === 56);
  });

  it('queues a 2 XLM planter referral reward when jobRef is provided', async () => {
    queuePlanterReferralReward.mockResolvedValueOnce({
      status: 'queued',
      rewardId: 99,
      referrerWallet: referrer,
      amountXlm: 2,
      rewardType: 'planter',
    });

    const response = await POST(
      new Request('http://localhost/api/referrals/reward', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          referredWallet: referred,
          jobRef: 'JOB-2026-001',
          role: 'planter',
        }),
      }) as never
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      status: 'queued',
      rewardId: 99,
      referrerWallet: referrer,
      amountXlm: 2,
      rewardType: 'planter',
    });
    expect(queuePlanterReferralReward).toHaveBeenCalledWith(
      expect.anything(),
      referred,
      'JOB-2026-001'
    );
    expect(queueReferralReward).not.toHaveBeenCalled();
  });

  it('queues a 1 XLM sponsor referral reward when treeRef is provided without planter role', async () => {
    queueReferralReward.mockResolvedValueOnce({
      status: 'queued',
      rewardId: 100,
      referrerWallet: referrer,
      amountXlm: 1,
      rewardType: 'sponsor',
    });

    const response = await POST(
      new Request('http://localhost/api/referrals/reward', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          referredWallet: referred,
          treeRef: 'TREE-2026-001',
        }),
      }) as never
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      status: 'queued',
      rewardId: 100,
      referrerWallet: referrer,
      amountXlm: 1,
      rewardType: 'sponsor',
    });
    expect(queueReferralReward).toHaveBeenCalledWith(
      expect.anything(),
      referred,
      'TREE-2026-001'
    );
  });

  it('returns 409 when the job is not eligible', async () => {
    queuePlanterReferralReward.mockResolvedValueOnce({
      status: 'not_eligible',
      amountXlm: 2,
      rewardType: 'planter',
    });

    const response = await POST(
      new Request('http://localhost/api/referrals/reward', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          referredWallet: referred,
          jobRef: 'JOB-UNFINISHED',
          role: 'planter',
        }),
      }) as never
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.status).toBe('not_eligible');
  });

  it('returns 400 when wallet is invalid or reference is missing', async () => {
    const response = await POST(
      new Request('http://localhost/api/referrals/reward', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          referredWallet: 'bad-wallet',
          jobRef: '',
        }),
      }) as never
    );

    expect(response.status).toBe(400);
  });
});
