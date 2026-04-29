/**
 * Cryptographic utilities for ZK proof generation
 * Uses @noble/hashes for secure hashing operations
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { randomBytes } from '@noble/hashes/utils';

/**
 * Generate a cryptographically secure random nonce
 * @returns Hex string of 32 random bytes
 */
export function generateNonce(): string {
  const bytes = randomBytes(32);
  return bytesToHex(bytes);
}

/**
 * Create a Poseidon-compatible field element from a string
 * For simplicity, we use SHA-256 and take modulo of a large prime
 * In production, use actual Poseidon hash from circomlibjs
 */
export function stringToFieldElement(input: string): bigint {
  const hash = sha256(new TextEncoder().encode(input));
  const hashBigInt = BigInt('0x' + bytesToHex(hash));
  
  // BN254 scalar field modulus (used in Groth16)
  const FIELD_MODULUS = BigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617'
  );
  
  return hashBigInt % FIELD_MODULUS;
}

/**
 * Generate a commitment to the donation
 * commitment = Hash(walletAddress || amount || nonce)
 */
export function generateDonationCommitment(
  walletAddress: string,
  amount: number,
  nonce: string
): string {
  const data = `${walletAddress}:${amount}:${nonce}`;
  const hash = sha256(new TextEncoder().encode(data));
  return bytesToHex(hash);
}

/**
 * Generate a nullifier to prevent double-donations
 * nullifier = Hash(walletAddress || nonce)
 * This ensures each wallet can only donate once per nonce
 */
export function generateNullifier(walletAddress: string, nonce: string): string {
  const data = `${walletAddress}:${nonce}`;
  const hash = sha256(new TextEncoder().encode(data));
  return bytesToHex(hash);
}

/**
 * Generate an amount commitment
 * amountCommitment = Hash(amount || nonce)
 */
export function generateAmountCommitment(amount: number, nonce: string): string {
  const data = `${amount}:${nonce}`;
  const hash = sha256(new TextEncoder().encode(data));
  return bytesToHex(hash);
}

/**
 * Convert a hex string to a BigInt field element
 */
export function hexToFieldElement(hex: string): bigint {
  const bytes = hexToBytes(hex.startsWith('0x') ? hex.slice(2) : hex);
  const hashBigInt = BigInt('0x' + bytesToHex(bytes));
  
  const FIELD_MODULUS = BigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617'
  );
  
  return hashBigInt % FIELD_MODULUS;
}

/**
 * Prepare inputs for the ZK circuit
 * Converts all inputs to field elements compatible with the circuit
 */
export function prepareCircuitInputs(
  walletAddress: string,
  amount: number,
  nonce: string
): {
  walletAddressField: string;
  amountField: string;
  nonceField: string;
  donationCommitment: string;
  nullifier: string;
  amountCommitment: string;
} {
  const walletAddressField = stringToFieldElement(walletAddress).toString();
  const amountField = BigInt(Math.floor(amount * 1000000)).toString(); // Convert to micro-units
  const nonceField = hexToFieldElement(nonce).toString();
  
  const donationCommitment = generateDonationCommitment(walletAddress, amount, nonce);
  const nullifier = generateNullifier(walletAddress, nonce);
  const amountCommitment = generateAmountCommitment(amount, nonce);
  
  return {
    walletAddressField,
    amountField,
    nonceField,
    donationCommitment,
    nullifier,
    amountCommitment,
  };
}
