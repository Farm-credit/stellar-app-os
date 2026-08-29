import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordReferralAttribution } = vi.hoisted(() => ({
  recordReferralAttribution: vi.fn(),
}));

vi.mock('@/lib/referrals', () => ({
  recordReferralAttribution,
}));

import { POST } from './route';

describe('POST /api/referrals/attribute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the 5 XLM bonus when a new sponsor is attributed', async () => {
    recordReferralAttribution.mockReturnValue({
      planterId: 'ada-okafor',
      sponsorId: 'sponsor-wallet',
      transactionHash: 'tx-123',
      bonusXlm: 5,
    });

    const response = await POST(
      new Request('http://localhost/api/referrals/attribute', {
        method: 'POST',
        body: JSON.stringify({
          planterId: 'ada-okafor',
          sponsorId: 'sponsor-wallet',
          transactionHash: 'tx-123',
        }),
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      planterId: 'ada-okafor',
      sponsorId: 'sponsor-wallet',
      transactionHash: 'tx-123',
      bonusXlm: 5,
      status: 'bonus_pending',
    });
  });

  it('rejects duplicate sponsor attribution', async () => {
    recordReferralAttribution.mockReturnValue(null);

    const response = await POST(
      new Request('http://localhost/api/referrals/attribute', {
        method: 'POST',
        body: JSON.stringify({
          planterId: 'ada-okafor',
          sponsorId: 'sponsor-wallet',
          transactionHash: 'tx-123',
        }),
      })
    );

    expect(response.status).toBe(409);
  });
});
