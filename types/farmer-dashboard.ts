export type MilestoneStatus = 'pending' | 'paid' | 'locked';
export type PlantingStatus = 'completed' | 'verified' | 'failed' | 'pending';
export type AssignmentStatus = 'upcoming' | 'in_progress';

export interface MilestonePayment {
  /** 'planting' = 75%, 'survival' = 25% */
  type: 'planting' | 'survival';
  percentage: 75 | 25;
  amountUsdc: number;
  status: MilestoneStatus;
  /** ISO date when paid or expected */
  date: string;
  txHash?: string;
}

export interface PlantingRecord {
  id: string;
  projectName: string;
  location: string;
  treesPlanted: number;
  plantedAt: string; // ISO date
  status: PlantingStatus;
  survivalRate: number | null; // 0–100, null if not yet measured
  milestones: [MilestonePayment, MilestonePayment]; // [75%, 25%]
}

export interface NextAssignment {
  id: string;
  projectName: string;
  location: string;
  treesTarget: number;
  scheduledDate: string; // ISO date
  status: AssignmentStatus;
  estimatedEarningUsdc: number;
}

export interface FarmerEarnings {
  totalPaidUsdc: number;
  pendingUsdc: number;
  /** Breakdown by month for the last 6 months */
  monthlyBreakdown: { month: string; amountUsdc: number }[];
}

export interface FarmerDashboardData {
  farmerId: string;
  farmerName: string;
  earnings: FarmerEarnings;
  plantingHistory: PlantingRecord[];
  nextAssignments: NextAssignment[];
  overallSurvivalRate: number; // 0–100
}
