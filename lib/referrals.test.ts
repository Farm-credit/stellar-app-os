import { describe, expect, it } from 'vitest';
import { getPlanterReferralUrl, recordReferralAttribution, REFERRAL_BONUS_XLM } from './referrals';

describe('referrals', () => {
  it('builds a planter-specific donation URL', () => {
    expect(getPlanterReferralUrl('ada-okafor', 'https://farmcredit.example/')).toBe(
      'https://farmcredit.example/donate?ref=ada-okafor'
    );
  });

  it('awards one 5 XLM bonus per sponsor', () => {
    const sponsorId = `sponsor-${Date.now()}-${Math.random()}`;
    const first = recordReferralAttribution('ada-okafor', sponsorId, 'tx-first');
    const duplicate = recordReferralAttribution('musa-bello', sponsorId, 'tx-second');

    expect(first?.bonusXlm).toBe(REFERRAL_BONUS_XLM);
    expect(duplicate).toBeNull();
  });
});
