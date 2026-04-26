/**
 * ZK types shared between the proof generator, API routes, and Soroban client.
 * All byte arrays are hex-encoded strings for JSON transport.
 */

/** Groth16 proof components (BN254). */
export interface ZkProof {
  /** G1 point A — 64 bytes hex (128 chars) */
  a: string;
  /** G2 point B — 128 bytes hex (256 chars) */
  b: string;
  /** G1 point C — 64 bytes hex (128 chars) */
  c: string;
}

/** Public inputs for Circuit 1 (anonymous donation). */
export interface ProofInputs {
  /** Pedersen commitment to (amount, donor_secret) — 32 bytes hex */
  commitment: string;
  /** H(donor_secret ∥ salt) — 32 bytes hex */
  nullifierHash: string;
}

/** Full output from the proof generator. */
export interface GeneratedProof {
  proof: ZkProof;
  inputs: ProofInputs;
  /** Raw nullifier (kept client-side only, never sent to chain) */
  nullifier: string;
}

/** snarkjs Groth16 proof shape (camelCase from snarkjs output). */
export interface SnarkjsProof {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: string;
  curve: string;
}

/** Request body for POST /api/transaction/build-anonymous-donation */
export interface AnonymousDonationRequest {
  proof: ZkProof;
  inputs: ProofInputs;
  /** Donation amount in USD */
  amount: number;
  network: 'testnet' | 'mainnet';
  idempotencyKey: string;
}

/** Success response from POST /api/transaction/build-anonymous-donation */
export interface AnonymousDonationResponse {
  transactionXdr: string;
  networkPassphrase: string;
  allocation: {
    total: number;
    planting: number;
    buffer: number;
  };
}
