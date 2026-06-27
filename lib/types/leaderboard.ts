export interface LeaderboardSponsor {
  rank: number;
  address: string; // Full Stellar address
  name?: string;    // Optional configured custom name/organization
  avatarUrl?: string;
  totalTrees: number;
  co2Offset: number; // in metric tons
  change: 'up' | 'down' | 'same';
}

export type LeaderboardPeriod = 'monthly' | 'all-time';
