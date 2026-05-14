export type MilestoneStatus = 'pending' | 'submitted' | 'validated' | 'released' | 'rejected';

export type EscrowStatus = 'active' | 'partially_released' | 'fully_released' | 'cancelled';

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
}

export interface MilestoneReleaseResponse {
  transactionHash: string;
  releasedAmountUsdc: number;
  farmerWalletAddress: string;
  explorerUrl: string;
}
