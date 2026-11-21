/**
 * Unit tests for the Hamming-distance + similarity helpers — Issue #825.
 */

import { describe, it, expect } from 'vitest';
import { hammingDistance, similarity, popcount, assertValidHex } from '@/lib/image/distance';
import { hexToBits, type PHashHex } from '@/lib/image/phash';

// ── Synthetic fingerprints ───────────────────────────────────────────────────

const HEX_A = '0000000000000000' as PHashHex;
const HEX_B = 'ffffffffffffffff' as PHashHex;
// Distance A→C = 32 (low half is 1, high half is 0).
const HEX_C = '00000000ffffffff' as PHashHex;
// Distance A→D = 64 (every bit flipped).
const HEX_D = 'ffffffff00000000' as PHashHex;
// Distance C→D = 32 (the same 32 bits flipped, but on different halves).
const HEX_E = '0000000000000000' as PHashHex; // == A; reserved
const HEX_F = 'aaaaaaaaaaaaaaaa' as PHashHex; // distance A→F = 32 (alternating nibbles)

void HEX_E;

// ── popcount ────────────────────────────────────────────────────────────────

describe('popcount', () => {
  it('counts all-zero and all-one bits correctly', () => {
    expect(popcount(hexToBits(HEX_A))).toBe(0);
    expect(popcount(hexToBits(HEX_B))).toBe(64);
  });

  it('counts mixed bits', () => {
    // HEX_C = 0x00000000ffffffff → 32 set bits
    expect(popcount(hexToBits(HEX_C))).toBe(32);
    // HEX_D = 0xffffffff00000000 → 32 set bits
    expect(popcount(hexToBits(HEX_D))).toBe(32);
    // HEX_F = 0xaaaaaaaaaaaaaaaa → 32 set bits (alternating nibbles)
    expect(popcount(hexToBits(HEX_F))).toBe(32);
  });

  it('handles a high-bit-set value without overflow', () => {
    // HEX_B starts with 0xff… so the underlying bigint is negative.
    // popcount must still return 64 (not 0).
    expect(popcount(hexToBits(HEX_B))).toBe(64);
  });
});

// ── hammingDistance ─────────────────────────────────────────────────────────

describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    expect(hammingDistance(HEX_A, HEX_A)).toBe(0);
    expect(hammingDistance(HEX_B, HEX_B)).toBe(0);
  });

  it('returns 64 for complementary hashes', () => {
    expect(hammingDistance(HEX_A, HEX_B)).toBe(64);
    expect(hammingDistance(HEX_C, HEX_D)).toBe(64);
  });

  it('returns 32 for half-different hashes', () => {
    // A vs C: bottom half differs (32 bits), top half same (0 bits) → 32.
    expect(hammingDistance(HEX_A, HEX_C)).toBe(32);
    // A vs F: alternating nibbles → 32 differing bits.
    expect(hammingDistance(HEX_A, HEX_F)).toBe(32);
  });

  it('accepts both hex and bigint forms', () => {
    const bitsA = hexToBits(HEX_A);
    const bitsB = hexToBits(HEX_B);
    expect(hammingDistance(bitsA, bitsB)).toBe(64);
    expect(hammingDistance(HEX_A, bitsB)).toBe(64);
    expect(hammingDistance(bitsA, HEX_B)).toBe(64);
  });

  it('is symmetric', () => {
    expect(hammingDistance(HEX_A, HEX_C)).toBe(hammingDistance(HEX_C, HEX_A));
    expect(hammingDistance(HEX_C, HEX_D)).toBe(hammingDistance(HEX_D, HEX_C));
  });
});

// ── similarity ──────────────────────────────────────────────────────────────

describe('similarity', () => {
  it('returns 1 for identical hashes', () => {
    expect(similarity(HEX_A, HEX_A)).toBe(1);
  });

  it('returns 0 for fully complementary hashes', () => {
    expect(similarity(HEX_A, HEX_B)).toBe(0);
    expect(similarity(HEX_C, HEX_D)).toBe(0);
  });

  it('returns 0.5 for half-different hashes', () => {
    expect(similarity(HEX_A, HEX_C)).toBeCloseTo(0.5, 5);
    expect(similarity(HEX_A, HEX_F)).toBeCloseTo(0.5, 5);
  });
});

// ── assertValidHex ───────────────────────────────────────────────────────────

describe('assertValidHex', () => {
  it('accepts a valid lowercase 16-char hex', () => {
    expect(assertValidHex('0123456789abcdef')).toBe('0123456789abcdef');
  });

  it('rejects non-strings', () => {
    expect(() => assertValidHex(42 as unknown as string)).toThrow(/must be a string/);
  });

  it('rejects wrong length', () => {
    expect(() => assertValidHex('abc')).toThrow(/16 characters/);
  });

  it('rejects uppercase', () => {
    expect(() => assertValidHex('0123456789ABCDEF')).toThrow(/lowercase/);
  });

  it('rejects non-hex characters', () => {
    expect(() => assertValidHex('0123456789abcde!')).toThrow(/lowercase base-16/);
  });
});
