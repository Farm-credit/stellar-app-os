export interface RewardTier {
  level: string;
  threshold: number;
  rewardDescription: string;
}

export interface ReferralStats {
  referralLink: string;
  referralsCount: number;
  totalEarnings: number;
  tiers: RewardTier[];
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

  if (!res.ok) {
    throw new Error('Failed to load referral data');
  }

  return res.json() as Promise<ReferralStats>;
}

// Temporary mock for development / testing
export function getMockReferralStats(): ReferralStats {
  return {
    referralLink: 'https://stellarapp.io/ref/abc123',
    referralsCount: 12,
    totalEarnings: 48.5,
    tiers: [
      {
        level: 'Bronze',
        threshold: 5,
        rewardDescription: 'Earn $5 credit per referral',
      },
      {
        level: 'Silver',
        threshold: 15,
        rewardDescription: 'Earn $10 credit per referral + priority support',
      },
      {
        level: 'Gold',
        threshold: 30,
        rewardDescription: 'Earn $20 credit per referral + exclusive features',
      },
    ],
  };
}
