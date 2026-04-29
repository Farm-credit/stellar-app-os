import type { NetworkType } from '@/lib/types/wallet';

/** Raw GPS coordinates (decimal degrees) */
export interface GpsCoordinates {
  lat: number;
  lon: number;
}

/**
 * Encrypted GPS payload sent by the farmer's device.
 * The coordinates are AES-256-GCM encrypted with the server's public key.
 *
 * Encoding: base64(iv) + '.' + base64(ciphertext) + '.' + base64(authTag)
 */
export interface EncryptedGpsPayload {
  /** base64-encoded AES-GCM iv (12 bytes) */
  iv: string;
  /** base64-encoded ciphertext */
  ciphertext: string;
  /** base64-encoded GCM auth tag (16 bytes) */
  authTag: string;
}

/** Circuit 2 ZK proof output */
export interface LocationProof {
  /** SHA-256(lat_i32_be || lon_i32_be || farmer_id_bytes || nonce_be) */
  commitment: string; // hex
  /** True when the point is inside the Northern Nigeria boundary */
  inRegion: boolean;
  /** Monotonically increasing per-farmer nonce */
  nonce: number;
  /** Unix timestamp (ms) when the proof was generated */
  generatedAt: number;
}

/** Request body for POST /api/location-proof */
export interface LocationProofRequest {
  /** Farmer's Stellar public key */
  farmerId: string;
  /** Encrypted GPS payload */
  encryptedGps: EncryptedGpsPayload;
  /** Nonce chosen by the client (must be > last used nonce for this farmer) */
  nonce: number;
  network: NetworkType;
  /** Contract address of the deployed location-proof contract */
  contractId: string;
}

/** Response from POST /api/location-proof */
export interface LocationProofResponse {
  /** Stellar transaction hash */
  transactionHash: string;
  /** Hex commitment stored on-chain */
  commitment: string;
  /** Whether the location was inside Northern Nigeria */
  inRegion: boolean;
}
