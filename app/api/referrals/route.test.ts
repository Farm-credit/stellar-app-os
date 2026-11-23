import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = (vi as unknown as { hoisted?: <T>(fn: () => T) => T }).hoisted ?? ((fn) => fn());

const { getReferralStats, registerReferral, isValidStellarAddress, getPool } =
  hoisted(() => ({
    getReferralStats: vi.fn(),
    registerReferral: vi.fn(),
    isValidStellarAddress: vi.fn(),
    getPool: vi.fn().mockReturnValue({}),
  }));

vi.mock('@/lib/referrals', () => ({
  getReferralStats,
  registerReferral,
  isValidStellarAddress,
}));

vi.mock('@/lib/db/client', () => ({
  getPool,
}));

import { GET, POST } from './route';

const referrer = `G${'A'.repeat(55)}`;
const referred = `G${'B'.repeat(55)}`;

describe('/api/referrals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isValidStellarAddress.mockImplementation((addr: string) => addr.startsWith('G') && addr.length === 56);
  });

  describe('GET /api/referrals', () => {
    it('returns stats for a valid wallet with role', async () => {
      getReferralStats.mockResolvedValueOnce({
        referralLink: 'https://farmcredit.app/?ref=ref_123&role=planter',
        referralCode: 'ref_123',
        referralsCount: 2,
        totalEarnings: 4,
        rewardsThisMonth: 2,
        monthlyCap: 10,
        tiers: [],
        role: 'planter',
        rewardAmountXlm: 2,
      });

      const response = await GET(
        new Request(`http://localhost/api/referrals?wallet=${referrer}&role=planter`) as never
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.role).toBe('planter');
      expect(json.rewardAmountXlm).toBe(2);
      expect(getReferralStats).toHaveBeenCalledWith(
        expect.anything(),
        referrer,
        undefined,
        'planter'
      );
    });

    it('returns 400 for an invalid wallet', async () => {
      const response = await GET(
        new Request('http://localhost/api/referrals?wallet=invalid') as never
      );
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/referrals', () => {
    it('registers a planter referral successfully', async () => {
      registerReferral.mockResolvedValueOnce(undefined);

      const response = await POST(
        new Request('http://localhost/api/referrals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: 'ref_planter_abc',
            referredWallet: referred,
            role: 'planter',
          }),
        }) as never
      );

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json).toEqual({ registered: true, role: 'planter' });
      expect(registerReferral).toHaveBeenCalledWith(
        expect.anything(),
        'ref_planter_abc',
        referred,
        'planter'
      );
    });

    it('returns 400 when missing parameters or invalid wallet', async () => {
      const response = await POST(
        new Request('http://localhost/api/referrals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: '',
            referredWallet: 'bad-wallet',
          }),
        }) as never
      );

      expect(response.status).toBe(400);
    });
  });
});
