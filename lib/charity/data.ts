import type { Campaign } from '@/lib/campaigns/data';

export interface CharityCampaign extends Campaign {
  description: string;
  charityCode: string;
  charityName: string;
  charityLogoUrl: string;
}

export const CHARITY_CAMPAIGNS: CharityCampaign[] = [];
