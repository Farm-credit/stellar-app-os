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

export interface CoBenefits {
  biodiversity?: number; // score 0-100
  soilHealth?: number; // score 0-100
}

export interface OwnedCreditHolding {
  id: string;
  projectName: string;
  quantity: number; // tonnes CO2e
  cost: number; // total cost paid
  currency: string; // ISO 4217 code, e.g. 'USD'
  retirementDate?: string; // ISO string; undefined if not yet retired
  coBenefits: CoBenefits;
}

export interface UserPortfolio {
  holdings: OwnedCreditHolding[];
  totalQuantity: number;
  totalCost: number;
}

export interface UserDashboardData {
  stats: UserSummaryStats;
  recentActivity: UserActivity[];
  portfolio: UserPortfolio;
}
