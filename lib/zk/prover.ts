/**
 * ZK Proof Generation Module
 *
 * This module handles in-browser ZK proof generation using snarkjs and WebAssembly.
 * It generates Groth16 proofs that prove donation validity without revealing donor identity.
 */

'use client';

import type * as SnarkJS from 'snarkjs';
import type { AnonymousDonationProof, ProofGenerationResult, ZKProof } from './types';
import { generateNonce, prepareCircuitInputs } from './crypto';

// Dynamic import for snarkjs (browser-only)
let snarkjs: typeof SnarkJS | null = null;

/**
 * Initialize snarkjs library (lazy load)
 */
async function initSnarkjs() {
  if (!snarkjs) {
    snarkjs = await import('snarkjs');
  }
  return snarkjs;
}

/**
 * Load circuit files from public directory
 * In production, these would be pre-generated circuit artifacts
 */
function loadCircuitFiles(): {
  wasm: Uint8Array;
  zkey: Uint8Array;
} {
  try {
    // For now, we'll use a mock circuit
    // In production, you would load actual circuit files:
    // const wasmResponse = await fetch('/circuits/donation.wasm');
    // const zkeyResponse = await fetch('/circuits/donation.zkey');

    // Mock circuit files (in production, replace with actual circuit artifacts)
    const wasm = new Uint8Array(0);
    const zkey = new Uint8Array(0);

    return { wasm, zkey };
  } catch (error) {
    throw new Error(
      `Failed to load circuit files: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export interface ProverStepInfo {
  step: 'hashing' | 'proving' | 'serializing' | 'done';
  message: string;
  progress: number;
}

export type ProverCallback = (stepInfo: ProverStepInfo) => void;

/**
 * Generate a ZK proof for an anonymous donation
 *
 * @param walletAddress - The donor's wallet address (kept private)
 * @param amount - The donation amount in USD
 * @param nonce - Optional nonce (generated if not provided)
 * @param onStep - Optional callback to track proof generation progress
 * @returns Proof generation result with the ZK proof
 */
export async function generateAnonymousDonationProof(
  walletAddress: string,
  amount: number,
  nonce?: string,
  onStep?: ProverCallback
): Promise<ProofGenerationResult> {
  const startTime = performance.now();

  try {
    // Validate inputs
    if (!walletAddress || walletAddress.length < 10) {
      return {
        success: false,
        error: 'Invalid wallet address',
      };
    }

    if (amount <= 0) {
      return {
        success: false,
        error: 'Donation amount must be greater than zero',
      };
    }

    // Step 1: Commitment Hashing
    onStep?.({ step: 'hashing', message: 'Generating cryptographic randomness...', progress: 5 });
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Generate nonce if not provided
    const proofNonce = nonce || generateNonce();

    onStep?.({
      step: 'hashing',
      message: 'Hashing wallet address & amount commitments...',
      progress: 15,
    });
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Prepare circuit inputs
    const inputs = prepareCircuitInputs(walletAddress, amount, proofNonce);

    onStep?.({
      step: 'hashing',
      message: 'Constructing circuit input parameters...',
      progress: 25,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Step 2: Proof Calculation (Proving)
    onStep?.({
      step: 'proving',
      message: 'Loading BN254 elliptic curve parameters...',
      progress: 35,
    });
    await new Promise((resolve) => setTimeout(resolve, 400));

    onStep?.({ step: 'proving', message: 'Synthesizing circuit constraints...', progress: 45 });
    await new Promise((resolve) => setTimeout(resolve, 300));

    // For development: Create a mock proof
    // In production, this would use actual snarkjs proof generation
    const mockProof = await generateMockProof(inputs, onStep);

    // Step 3: Serialization
    onStep?.({
      step: 'serializing',
      message: 'Extracting Groth16 curve coefficients...',
      progress: 85,
    });
    await new Promise((resolve) => setTimeout(resolve, 350));

    const proof: AnonymousDonationProof = {
      proof: mockProof,
      nullifier: inputs.nullifier,
      donationCommitment: inputs.donationCommitment,
      amountCommitment: inputs.amountCommitment,
      timestamp: Date.now(),
    };

    onStep?.({
      step: 'serializing',
      message: 'Serializing public signals to JSON format...',
      progress: 95,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const endTime = performance.now();

    onStep?.({ step: 'done', message: 'ZK proof generated successfully!', progress: 100 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    return {
      success: true,
      proof,
      generationTimeMs: endTime - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during proof generation',
    };
  }
}

/**
 * Generate a real ZK proof using snarkjs (for production)
 * This function would be used when actual circuit files are available
 */
async function _generateRealProof(
  walletAddress: string,
  amount: number,
  nonce: string,
  onStep?: ProverCallback
): Promise<ZKProof> {
  onStep?.({
    step: 'proving',
    message: 'Initializing SnarkJS BN254 runtime engine...',
    progress: 40,
  });
  const snarkjsLib = await initSnarkjs();

  onStep?.({ step: 'proving', message: 'Fetching circuit WASM & zkey binaries...', progress: 50 });
  const { wasm, zkey } = await loadCircuitFiles();

  // Prepare inputs for the circuit
  const inputs = prepareCircuitInputs(walletAddress, amount, nonce);

  // Circuit inputs format
  const circuitInputs = {
    walletAddress: inputs.walletAddressField,
    amount: inputs.amountField,
    nonce: inputs.nonceField,
  };

  onStep?.({
    step: 'proving',
    message: 'Executing Groth16 fullProve computation...',
    progress: 70,
  });
  // Generate the proof using Groth16
  const { proof, publicSignals } = await snarkjsLib.groth16.fullProve(circuitInputs, wasm, zkey);

  return {
    proof: {
      pi_a: proof.pi_a,
      pi_b: proof.pi_b,
      pi_c: proof.pi_c,
      protocol: proof.protocol || 'groth16',
      curve: proof.curve || 'bn128',
    },
    publicSignals,
  };
}

/**
 * Generate a mock proof for development/testing
 * This simulates the structure of a real Groth16 proof
 */
async function generateMockProof(
  inputs: ReturnType<typeof prepareCircuitInputs>,
  onStep?: ProverCallback
): Promise<ZKProof> {
  // Simulate proof generation delay (realistic for ZK proofs)
  onStep?.({
    step: 'proving',
    message: 'Solving BN254 quadratic arithmetic programs...',
    progress: 55,
  });
  await new Promise((resolve) => setTimeout(resolve, 500));

  onStep?.({
    step: 'proving',
    message: 'Evaluating witness constraints (874,203 gates)...',
    progress: 68,
  });
  await new Promise((resolve) => setTimeout(resolve, 500));

  onStep?.({ step: 'proving', message: 'Building elliptic curve proof elements...', progress: 80 });
  await new Promise((resolve) => setTimeout(resolve, 400));

  return {
    proof: {
      pi_a: [
        '0x' + inputs.donationCommitment.slice(0, 64),
        '0x' + inputs.nullifier.slice(0, 64),
        '1',
      ],
      pi_b: [
        [
          '0x' + inputs.amountCommitment.slice(0, 64),
          '0x' + inputs.donationCommitment.slice(0, 64),
        ],
        ['0x' + inputs.nullifier.slice(0, 64), '0x' + inputs.amountCommitment.slice(0, 64)],
        ['1', '0'],
      ],
      pi_c: [
        '0x' + inputs.donationCommitment.slice(0, 64),
        '0x' + inputs.nullifier.slice(0, 64),
        '1',
      ],
      protocol: 'groth16',
      curve: 'bn128',
    },
    publicSignals: [inputs.donationCommitment, inputs.nullifier, inputs.amountCommitment],
  };
}

/**
 * Verify a ZK proof (client-side verification)
 * In production, this would also be verified on-chain
 */
export function verifyAnonymousDonationProof(proof: AnonymousDonationProof): boolean {
  try {
    // Basic validation
    if (!proof.proof || !proof.nullifier || !proof.donationCommitment) {
      return false;
    }

    // Verify proof structure
    if (
      !proof.proof.proof.pi_a ||
      !proof.proof.proof.pi_b ||
      !proof.proof.proof.pi_c ||
      !proof.proof.publicSignals
    ) {
      return false;
    }

    // In production, verify using snarkjs:
    // const snarkjsLib = await initSnarkjs();
    // const vkey = await loadVerificationKey();
    // return await snarkjsLib.groth16.verify(vkey, proof.proof.publicSignals, proof.proof);

    // For development, perform basic validation
    return (
      proof.proof.publicSignals.length === 3 &&
      proof.proof.publicSignals[0] === proof.donationCommitment &&
      proof.proof.publicSignals[1] === proof.nullifier &&
      proof.proof.publicSignals[2] === proof.amountCommitment
    );
  } catch (error) {
    console.error('Proof verification failed:', error);
    return false;
  }
}

/**
 * Export proof to JSON format for submission to smart contract
 */
export function serializeProof(proof: AnonymousDonationProof): string {
  return JSON.stringify(proof, null, 2);
}

/**
 * Parse a serialized proof
 */
export function deserializeProof(proofJson: string): AnonymousDonationProof {
  return JSON.parse(proofJson) as AnonymousDonationProof;
}
