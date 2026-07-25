import type { NetworkType } from './wallet';

export interface NdviSubmissionRequest {
  farmerPublicKey: string;
  /** NDVI value as a 0.0 - 1.0 normalized number */
  ndvi: number;
  /** SHA-256 hex of the survival proof bundle (GPS + photo + ZK attestation) */
  proofHash: string;
  /** Which contract to call: 'tree-escrow' | 'escrow-milestone' */
  contractType: 'tree-escrow' | 'escrow-milestone';
  network: NetworkType;
  /** Hex-encoded ed25519 signature of the canonical payload by the trusted oracle */
  signature: string;
  /** Latitude of the planting location */
  lat: number;
  /** Longitude of the planting location */
  /** Latitude of the measurement */
  lat: number;
  /** Longitude of the measurement */
  lon: number;
}

export interface NdviSubmissionResponse {
  outcome: 'completed' | 'disputed';
  amountReleased: string;
  survivalRate: number;
  transactionHash: string;
  /** Anonymized region hash based on coordinates */
  region: {
    regionKey: string;
    centerLat: number;
    centerLon: number;
  };
}
