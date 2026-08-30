export interface LeaderboardSponsor {
  rank: number;
  address: string; // Full Stellar address
  name?: string; // Optional configured custom name/organization
  avatarUrl?: string;
  totalTrees: number;
  co2Offset: number; // in metric tons
  change: 'up' | 'down' | 'same';
  bonus?: BonusReward;
}

export interface LeaderboardPlanter {
  rank: number;
  address: string;
  name?: string;
  avatarUrl?: string;
  totalTrees: number; // Trees planted
  co2Offset: number;
  change: 'up' | 'down' | 'same';
  bonus?: BonusReward;
}

export type LeaderboardPeriod = 'monthly' | 'all-time';
export type LeaderboardCategory = 'sponsors' | 'planters';

export type BonusType = 'xlm' | 'nft' | 'merchandise';

export interface BonusReward {
  type: BonusType;
  amount?: number; // For XLM
  description: string;
  claimed: boolean;
}

export interface LeaderboardEntryWithBonus extends LeaderboardSponsor {
  bonus?: BonusReward;
}
