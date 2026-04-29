/**
 * Zero-Knowledge Proof Types for Privacy-Preserving Donations
 * 
 * This module defines types for generating and verifying ZK proofs that allow
 * donors to prove they made a valid donation without revealing their wallet address.
 */

export interface ZKProofInput {
  // Private inputs (not revealed)
  donorWalletAddress: string;
  donationAmount: number;
  randomNonce: string; // Random value for uniqueness
  
  // Public inputs (revealed on-chain)
  donationCommitment: string; // Hash of (walletAddress + amount + nonce)
  nullifier: string; // Prevents double-spending: Hash(walletAddress + nonce)
  amountCommitment: string; // Commitment to the amount
}

export interface ZKProof {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals: string[];
}

export interface AnonymousDonationProof {
  proof: ZKProof;
  nullifier: string; // Unique identifier to prevent double-donations
  donationCommitment: string; // Commitment to the donation
  amountCommitment: string; // Commitment to the amount
  timestamp: number;
}

export interface ZKCircuitConfig {
  wasmPath: string;
  zkeyPath: string;
  verificationKeyPath: string;
}

export interface ProofGenerationResult {
  success: boolean;
  proof?: AnonymousDonationProof;
  error?: string;
  generationTimeMs?: number;
}

export interface ProofVerificationResult {
  isValid: boolean;
  error?: string;
}
