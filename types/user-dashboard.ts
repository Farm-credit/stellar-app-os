export type ActivityType = 'donation' | 'credit_purchase' | 'credit_retirement' | 'portfolio_view';

export interface UserActivity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string; // ISO string
  amount?: string;
  unit?: string;
}

export interface UserSummaryStats {
  totalDonationsAmount: number;
  totalDonationsTrees: number;
  totalCarbonCreditsOwned: number;
  totalCO2OffsetKg: number;
}

export interface UserDashboardData {
  stats: UserSummaryStats;
  recentActivity: UserActivity[];
}
