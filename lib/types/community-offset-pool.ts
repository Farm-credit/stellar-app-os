export type CommunityPoolStatus = 'open' | 'funded' | 'purchased' | 'cancelled';
export interface CommunityPoolMember {
  wallet: string;
  contribution: number;
  sharePercent: number;
  creditsAllocated: number;
  joinedAt: string;
}
export interface CommunityOffsetPool {
  id: string;
  name: string;
  description?: string;
  creditProject: string;
  targetAmount: number;
  totalContributed: number;
  remainingAmount: number;
  pricePerCredit: number;
  estimatedCredits: number;
  status: CommunityPoolStatus;
  members: CommunityPoolMember[];
  deadline?: string;
  createdAt: string;
}
export interface CreateCommunityPoolInput {
  name: string;
  description?: string;
  creditProject: string;
  targetAmount: number;
  pricePerCredit: number;
  creatorWallet: string;
  initialContribution?: number;
  deadline?: string;
}
export interface JoinCommunityPoolInput {
  poolId: string;
  wallet: string;
  amount: number;
}
