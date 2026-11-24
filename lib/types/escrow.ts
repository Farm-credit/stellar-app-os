export type MilestoneStatus = 'pending' | 'submitted' | 'validated' | 'released' | 'rejected';

export type EscrowStatus = 'active' | 'partially_released' | 'fully_released' | 'cancelled';

export type MilestoneFinalizationStatus = 'pending_grace' | 'finalized' | 'rejected' | 'disputed';

export const VERIFIER_REWARD_BPS = 200;
export const BPS_DENOM = 10_000;
export const DEFAULT_MILESTONE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export interface MilestonePayoutSplit {
  totalDisbursementUsdc: number;
  verifierRewardUsdc: number;
  farmerPayoutUsdc: number;
  totalStroops: bigint;
  verifierRewardStroops: bigint;
  farmerPayoutStroops: bigint;
}

export interface MilestoneFinalizationRecord {
  id: string;
  loanId: string;
  milestoneId: number;
  farmerWalletAddress: string;
  approvingVerifierAddress: string;
  escrowSecretKey?: string;
  network: 'testnet' | 'mainnet';
  totalDisbursementUsdc: number;
  split: MilestonePayoutSplit;
  approvedAt: string;
  gracePeriodEndsAt: string;
  status: MilestoneFinalizationStatus;
  finalizedAt?: string;
  transactionHash?: string;
  explorerUrl?: string;
  failureReason?: string;
}

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface MilestoneVerification {
  gpsCoordinates: GpsCoordinates;
  photoBase64: string;
  photoMimeType: string;
  submittedAt: string;
  notes?: string;
}

export interface EscrowLoan {
  id: string;
  farmerWalletAddress: string;
  escrowWalletAddress: string;
  totalAmountUsdc: number;
  releasedAmountUsdc: number;
  network: 'testnet' | 'mainnet';
  status: EscrowStatus;
  createdAt: string;
}

export interface MilestoneReleaseRequest {
  loanId: string;
  farmerWalletAddress: string;
  escrowSecretKey: string;
  network: 'testnet' | 'mainnet';
  verification: MilestoneVerification;
  verifierWalletAddress?: string;
  gracePeriodEndsAt?: string;
  milestoneId?: number;
}

export interface MilestoneReleaseResponse {
  transactionHash: string;
  releasedAmountUsdc: number;
  farmerWalletAddress: string;
  explorerUrl: string;
  farmerPayoutUsdc?: number;
  verifierWalletAddress?: string;
  verifierRewardUsdc?: number;
  gracePeriodEndsAt?: string;
  finalizationStatus?: MilestoneFinalizationStatus;
}
