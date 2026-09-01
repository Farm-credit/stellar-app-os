import type {
  AffiliateCommissionTier,
  AffiliateProgramInfo,
  AffiliateReferral,
} from '@/lib/types/affiliate';

/** The four commission bands that make up the 10–25% revenue share. */
export const AFFILIATE_TIERS: AffiliateCommissionTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    commissionRate: 10,
    monthlyVolumeMinUsdc: 0,
    monthlyVolumeMaxUsdc: 4_999,
    perks: ['10% on referred sponsors', 'Basic analytics dashboard', 'Monthly payouts'],
  },
  {
    id: 'growth',
    name: 'Growth',
    commissionRate: 15,
    monthlyVolumeMinUsdc: 5_000,
    monthlyVolumeMaxUsdc: 24_999,
    perks: ['15% on referred sponsors', 'Advanced analytics + insights', 'Bi-monthly payouts'],
  },
  {
    id: 'pro',
    name: 'Pro',
    commissionRate: 20,
    monthlyVolumeMinUsdc: 25_000,
    monthlyVolumeMaxUsdc: 99_999,
    perks: [
      '20% on referred sponsors',
      'Real-time tracking',
      'Weekly payouts',
      'Dedicated support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    commissionRate: 25,
    monthlyVolumeMinUsdc: 100_000,
    monthlyVolumeMaxUsdc: null,
    perks: [
      '25% on referred sponsors',
      'Co-branded campaigns',
      'Priority payouts',
      'Account manager',
    ],
  },
];

/** Return the commission tier a partner qualifies for at a given monthly volume. */
export function getCommissionTierForVolume(monthlyVolumeUsdc: number): AffiliateCommissionTier {
  return (
    AFFILIATE_TIERS.find(
      (tier) =>
        monthlyVolumeUsdc >= tier.monthlyVolumeMinUsdc &&
        (tier.monthlyVolumeMaxUsdc === null || monthlyVolumeUsdc < tier.monthlyVolumeMaxUsdc)
    ) ?? AFFILIATE_TIERS[0]
  );
}

/** Compute the commission (USDC) for a contribution at a given rate. */
export function getCommissionAmount(contributionUsdc: number, commissionRate: number): number {
  return Math.round(contributionUsdc * (commissionRate / 100) * 100) / 100;
}

const MOCK_REFERRALS: AffiliateReferral[] = [
  {
    id: 'ref-001',
    sponsorName: 'Eco Futures Collective',
    joinedAt: '2026-08-14',
    contributedUsdc: 12_400,
    earnedUsdc: 1_860,
    status: 'paid',
    source: 'partner',
  },
  {
    id: 'ref-002',
    sponsorName: 'Maya Okonkwo',
    joinedAt: '2026-08-21',
    contributedUsdc: 6_000,
    earnedUsdc: 900,
    status: 'paid',
    source: 'influencer',
  },
  {
    id: 'ref-003',
    sponsorName: 'Greenleaf Ventures',
    joinedAt: '2026-08-25',
    contributedUsdc: 3_200,
    earnedUsdc: 480,
    status: 'eligible',
    source: 'partner',
  },
  {
    id: 'ref-004',
    sponsorName: 'Cedar & Co.',
    joinedAt: '2026-08-28',
    contributedUsdc: 1_750,
    earnedUsdc: 262.5,
    status: 'eligible',
    source: 'influencer',
  },
  {
    id: 'ref-005',
    sponsorName: 'Kofi Mensah',
    joinedAt: '2026-08-29',
    contributedUsdc: 500,
    earnedUsdc: 75,
    status: 'pending',
    source: 'influencer',
  },
];

/**
 * Temporary mock for development / testing. Swap for a real API once the
 * affiliate backend is wired up.
 */
export function getMockAffiliateProgram(): AffiliateProgramInfo {
  const thisMonthContributionsUsdc = 9_450;
  const totalContributionsUsdc = MOCK_REFERRALS.reduce((s, r) => s + r.contributedUsdc, 0);
  const totalEarnedUsdc = MOCK_REFERRALS.reduce((s, r) => s + r.earnedUsdc, 0);
  const tier = getCommissionTierForVolume(thisMonthContributionsUsdc);

  const paidOutUsdc = MOCK_REFERRALS.filter((r) => r.status === 'paid').reduce(
    (s, r) => s + r.earnedUsdc,
    0
  );
  const pendingPayoutUsdc = totalEarnedUsdc - paidOutUsdc;

  return {
    stats: {
      tier,
      totalSponsorsReferred: 38,
      totalContributionsUsdc,
      totalEarnedUsdc,
      pendingPayoutUsdc,
      paidOutUsdc,
      thisMonthContributionsUsdc,
      referralLink: 'https://farmcredit.app/?aff=partner-6f3d',
    },
    tiers: AFFILIATE_TIERS,
    referrals: [...MOCK_REFERRALS].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)),
  };
}
