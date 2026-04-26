/**
 * Client-side Groth16 proof generator for Circuit 1 (anonymous donation).
 *
 * Uses snarkjs to generate a proof that the donor knows a secret that
 * commits to the donation amount — without revealing the wallet address.
 *
 * Circuit 1 private inputs:  donor_secret, amount
 * Circuit 1 public inputs:   commitment = H(amount ∥ donor_secret)
 *                             nullifier_hash = H(donor_secret ∥ salt)
 */

import type { GeneratedProof, SnarkjsProof, ZkProof, ProofInputs } from './types';

// Paths to the circuit artifacts (served from /public/circuits/)
const WASM_PATH = '/circuits/circuit1_donation.wasm';
const ZKEY_PATH = '/circuits/circuit1_donation_final.zkey';

// ── Crypto helpers ────────────────────────────────────────────────────────────

/** SHA-256 of arbitrary bytes, returns hex string. */
async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Encode a UTF-8 string to bytes. */
function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Concatenate two Uint8Arrays. */
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Convert a hex string to a BigInt (for snarkjs field inputs). */
function hexToBigInt(hex: string): bigint {
  return BigInt('0x' + hex);
}

// ── Proof generation ──────────────────────────────────────────────────────────

/**
 * Generate a Groth16 ZK proof for an anonymous donation.
 *
 * @param donorSecret  - Donor's private secret (never leaves the client)
 * @param amount       - Donation amount in USD cents (integer)
 * @param salt         - Per-donation random salt (UUID or random hex)
 * @returns GeneratedProof containing the proof, public inputs, and nullifier
 * @throws Error with descriptive message on failure
 */
export async function generateDonationProof(
  donorSecret: string,
  amount: number,
  salt: string
): Promise<GeneratedProof> {
  if (!donorSecret || donorSecret.length < 16) {
    throw new Error('donor_secret must be at least 16 characters');
  }
  if (amount <= 0 || !Number.isInteger(amount)) {
    throw new Error('amount must be a positive integer (USD cents)');
  }

  // Derive commitment = SHA-256(amount_bytes ∥ donor_secret)
  const amountBytes = new Uint8Array(8);
  new DataView(amountBytes.buffer).setBigUint64(0, BigInt(amount), false);
  const secretBytes = strToBytes(donorSecret);
  const commitmentHex = await sha256Hex(concat(amountBytes, secretBytes));

  // Derive nullifier = SHA-256(donor_secret ∥ salt)
  const saltBytes = strToBytes(salt);
  const nullifierHex = await sha256Hex(concat(secretBytes, saltBytes));

  // Derive nullifier_hash = SHA-256(nullifier)
  const nullifierBytes = new Uint8Array(
    nullifierHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  const nullifierHashHex = await sha256Hex(nullifierBytes);

  // Build snarkjs circuit inputs
  const circuitInputs = {
    // Private
    donor_secret: hexToBigInt(await sha256Hex(secretBytes)).toString(),
    amount: amount.toString(),
    salt: hexToBigInt(await sha256Hex(saltBytes)).toString(),
    // Public (must match what the circuit exposes)
    commitment: hexToBigInt(commitmentHex).toString(),
    nullifier_hash: hexToBigInt(nullifierHashHex).toString(),
  };

  // Dynamically import snarkjs to keep it out of the server bundle
  const snarkjs = await importSnarkjs();

  let snarkProof: SnarkjsProof;
  let publicSignals: string[];

  try {
    const result = await snarkjs.groth16.fullProve(circuitInputs, WASM_PATH, ZKEY_PATH);
    snarkProof = result.proof as SnarkjsProof;
    publicSignals = result.publicSignals as string[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Proof generation failed: ${msg}`);
  }

  // Serialise proof to hex byte arrays for on-chain submission
  const proof = serialiseProof(snarkProof);

  // Public inputs from snarkjs output (commitment, nullifier_hash)
  const inputs: ProofInputs = {
    commitment:     bigIntToHex32(BigInt(publicSignals[0])),
    nullifierHash:  bigIntToHex32(BigInt(publicSignals[1])),
  };

  return {
    proof,
    inputs,
    nullifier: nullifierHex,
  };
}

// ── Serialisation ─────────────────────────────────────────────────────────────

/**
 * Convert a snarkjs proof to the hex-encoded format expected by the
 * Soroban ZkVerifier contract.
 */
export function serialiseProof(snarkProof: SnarkjsProof): ZkProof {
  // G1 point: x ∥ y (each 32 bytes)
  const aX = bigIntToHex32(BigInt(snarkProof.pi_a[0]));
  const aY = bigIntToHex32(BigInt(snarkProof.pi_a[1]));

  // G2 point: x_re ∥ x_im ∥ y_re ∥ y_im (each 32 bytes)
  // snarkjs stores G2 as [[x_im, x_re], [y_im, y_re]] (reversed)
  const bXRe = bigIntToHex32(BigInt(snarkProof.pi_b[0][1]));
  const bXIm = bigIntToHex32(BigInt(snarkProof.pi_b[0][0]));
  const bYRe = bigIntToHex32(BigInt(snarkProof.pi_b[1][1]));
  const bYIm = bigIntToHex32(BigInt(snarkProof.pi_b[1][0]));

  const cX = bigIntToHex32(BigInt(snarkProof.pi_c[0]));
  const cY = bigIntToHex32(BigInt(snarkProof.pi_c[1]));

  return {
    a: aX + aY,
    b: bXRe + bXIm + bYRe + bYIm,
    c: cX + cY,
  };
}

/**
 * Deserialise a ZkProof from JSON, validating byte lengths.
 * Throws a descriptive error if the schema is invalid.
 */
export function deserialiseProof(raw: unknown): ZkProof {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('ZkProof must be an object');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.a !== 'string' || obj.a.length !== 128) {
    throw new Error('ZkProof.a must be a 128-char hex string (64 bytes)');
  }
  if (typeof obj.b !== 'string' || obj.b.length !== 256) {
    throw new Error('ZkProof.b must be a 256-char hex string (128 bytes)');
  }
  if (typeof obj.c !== 'string' || obj.c.length !== 128) {
    throw new Error('ZkProof.c must be a 128-char hex string (64 bytes)');
  }
  return { a: obj.a, b: obj.b, c: obj.c };
}

/**
 * Deserialise ProofInputs from JSON, validating byte lengths.
 */
export function deserialiseInputs(raw: unknown): ProofInputs {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('ProofInputs must be an object');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.commitment !== 'string' || obj.commitment.length !== 64) {
    throw new Error('ProofInputs.commitment must be a 64-char hex string (32 bytes)');
  }
  if (typeof obj.nullifierHash !== 'string' || obj.nullifierHash.length !== 64) {
    throw new Error('ProofInputs.nullifierHash must be a 64-char hex string (32 bytes)');
  }
  return { commitment: obj.commitment, nullifierHash: obj.nullifierHash };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Convert a BigInt to a zero-padded 32-byte (64-char) hex string. */
function bigIntToHex32(n: bigint): string {
  return n.toString(16).padStart(64, '0');
}

/** Dynamically import snarkjs (browser/Node compatible). */
async function importSnarkjs(): Promise<typeof import('snarkjs')> {
  try {
    return await import('snarkjs');
  } catch {
    throw new Error(
      'snarkjs is not installed. Run: npm install snarkjs'
    );
  }
}
