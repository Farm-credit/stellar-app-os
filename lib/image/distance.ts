/**
 * Hamming distance + similarity utilities for pHash fingerprints.
 *
 * Two pHash values are "duplicates" if their Hamming distance is small
 * (typically 0–5 for identical or near-identical images).  The threshold
 * depends on the use case; defaults exposed via env vars in
 * `lib/db/photo-hashes.ts`.
 *
 * Implementation uses bitwise XOR + population-count, which is O(1) per
 * comparison once the hex strings are parsed to bigint.
 */

import { hexToBits, PHASH_HEX_LENGTH, type PHashBits, type PHashHex } from './phash';

/** 64-bit unsigned mask. */
const MASK_64 = (BigInt(1) << BigInt(64)) - BigInt(1);

// ── Population count ──────────────────────────────────────────────────────────

/**
 * Number of set bits in a 64-bit bigint.  Always masks to 64 bits first so
 * a `0x8000…` hash (which becomes negative in JS's signed bigint
 * representation) is counted correctly.
 */
export function popcount(value: PHashBits): number {
  let v = value & MASK_64;
  let count = 0;
  while (v > BigInt(0)) {
    if ((v & BigInt(1)) === BigInt(1)) count++;
    v >>= BigInt(1);
  }
  return count;
}

// ── Hamming distance ─────────────────────────────────────────────────────────

/**
 * Hamming distance between two 64-bit pHash fingerprints — the number of
 * bits that differ.  O(1) per pair.
 */
export function hammingDistance(a: PHashHex | PHashBits, b: PHashHex | PHashBits): number {
  const ab = typeof a === 'string' ? hexToBits(a as PHashHex) : a;
  const bb = typeof b === 'string' ? hexToBits(b as PHashHex) : b;
  // XOR + popcount
  return popcount(((ab ^ bb) & MASK_64) as PHashBits);
}

/**
 * Convert a Hamming distance (0..64) to a similarity score in the range
 * [0, 1].  A distance of 0 → 1.0 (identical), 64 → 0.0 (maximally
 * different).
 */
export function similarity(a: PHashHex | PHashBits, b: PHashHex | PHashBits): number {
  return 1 - hammingDistance(a, b) / 64;
}

/**
 * Normalised hex validation helper — throws if the input is not a valid
 * 16-character lowercase hex string.  Used by the storage layer before
 * inserting hashes into PostgreSQL.
 */
export function assertValidHex(value: string): PHashHex {
  if (typeof value !== 'string') {
    throw new TypeError(`pHash hex must be a string, got ${typeof value}`);
  }
  if (value.length !== PHASH_HEX_LENGTH) {
    throw new RangeError(
      `pHash hex must be exactly ${PHASH_HEX_LENGTH} characters, got ${value.length}`
    );
  }
  if (!/^[0-9a-f]+$/.test(value)) {
    throw new RangeError(`pHash hex must be lowercase base-16, got "${value}"`);
  }
  return value as PHashHex;
}
