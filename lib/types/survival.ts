import type { NetworkType } from './wallet';

/** POST /api/transaction/verify-survival */
export interface SurvivalVerificationRequest {
  /** Farmer's Stellar public key (G...) */
  farmerPublicKey: string;
  /** Oracle-confirmed survival rate 0–100 */
  survivalRate: number;
  /** SHA-256 hex of the survival proof bundle (GPS + photo + ZK attestation) */
  proofHash: string;
  /** Which contract to call: 'tree-escrow' | 'escrow-milestone' */
  contractType: 'tree-escrow' | 'escrow-milestone';
  network: NetworkType;
}

export interface SurvivalVerificationResponse {
  /** 'completed' | 'disputed' */
  outcome: 'completed' | 'disputed';
  /** Amount released to farmer (0 if disputed) */
  amountReleased: string;
  survivalRate: number;
  transactionHash: string;
}

/** POST /api/transaction/resolve-dispute */
export interface DisputeResolutionRequest {
  farmerPublicKey: string;
  releaseToFarmer: boolean;
  contractType: 'tree-escrow' | 'escrow-milestone';
  network: NetworkType;
}

export interface DisputeResolutionResponse {
  transactionHash: string;
  amountReleased: string;
  releasedTo: 'farmer' | 'donor';
}
