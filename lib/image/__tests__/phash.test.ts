/**
 * Unit tests for the pHash algorithm — Issue #825.
 *
 * Covers:
 *   • Algorithm correctness on synthetic 32×32 matrices.
 *   • Stability under re-encoding the same matrix (pure function).
 *   • Determinism for identical inputs.
 *   • Hamming distance invariants for known-near and known-far inputs.
 *   • Buffer decode path via real JPEG fixtures (uses sharp).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  computePHash,
  computePHashFromMatrix,
  hexToBits,
  PHASH_BIT_WIDTH,
  PHASH_HEX_LENGTH,
  PHASH_RESIZE,
  PHASH_DCT_SIZE,
} from '@/lib/image/phash';
import { hammingDistance } from '@/lib/image/distance';

// ── Fixture helpers ──────────────────────────────────────────────────────────

/** Build an N×N matrix with constant intensity. */
function flatMatrix(n: number, value: number): number[] {
  return new Array(n * n).fill(value);
}

/** Build an N×N matrix that ramps from 0 → 255 along rows. */
function rampMatrix(n: number): number[] {
  const out = new Array<number>(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      out[y * n + x] = Math.floor((255 * x) / (n - 1));
    }
  }
  return out;
}

/** Build a checkerboard of 0/255 cells. */
function checkerboardMatrix(n: number, cells: number): number[] {
  const out = new Array<number>(n * n);
  const block = Math.floor(n / cells);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cx = Math.floor(x / block) % 2;
      const cy = Math.floor(y / block) % 2;
      out[y * n + x] = (cx + cy) % 2 === 0 ? 0 : 255;
    }
  }
  return out;
}

/** Build a tiny solid-color JPEG buffer (red 8×8) for the integration path. */
async function redJpegBuffer(): Promise<Buffer> {
  // Use sharp dynamically to avoid the import being elided during typecheck.
  const sharp = (await import('sharp')).default;
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Same image, encoded at a different quality. */
async function redJpegBufferLowQuality(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg({ quality: 30 })
    .toBuffer();
}

/** Visually different image (solid blue). */
async function blueJpegBuffer(): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 0, g: 0, b: 255 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

// ── Constants ────────────────────────────────────────────────────────────────

describe('pHash constants', () => {
  it('uses a 64-bit / 16-hex output', () => {
    expect(PHASH_BIT_WIDTH).toBe(64);
    expect(PHASH_HEX_LENGTH).toBe(16);
    expect(PHASH_DCT_SIZE * PHASH_DCT_SIZE).toBe(PHASH_BIT_WIDTH);
  });

  it('uses a 32×32 DCT input grid', () => {
    expect(PHASH_RESIZE).toBe(32);
  });
});

// ── Algorithm: synthetic matrices ────────────────────────────────────────────

describe('computePHashFromMatrix', () => {
  it('produces a 16-char hex string for a constant-intensity matrix', () => {
    const result = computePHashFromMatrix(flatMatrix(PHASH_RESIZE, 128));
    expect(result.hex).toMatch(/^[0-9a-f]{16}$/);
    expect(result.population).toBeGreaterThanOrEqual(0);
    expect(result.population).toBeLessThanOrEqual(PHASH_BIT_WIDTH);
  });

  it('is deterministic for the same input', () => {
    const m = rampMatrix(PHASH_RESIZE);
    const a = computePHashFromMatrix(m);
    const b = computePHashFromMatrix(m);
    expect(a.hex).toBe(b.hex);
    expect(hammingDistance(a.hex, b.hex)).toBe(0);
  });

  it('throws on a wrong-sized matrix', () => {
    expect(() => computePHashFromMatrix(flatMatrix(16, 0))).toThrow(/expected 1024 cells/);
  });

  it('returns a low population for a flat matrix (no high-frequency content)', () => {
    const flat = computePHashFromMatrix(flatMatrix(PHASH_RESIZE, 128));
    // A constant matrix has a single non-zero DCT coefficient (the DC term
    // at (0,0)); all AC terms are zero, so the median threshold fires on
    // at most one cell.  Population is bounded by 4 in practice.
    expect(flat.population).toBeGreaterThanOrEqual(0);
    expect(flat.population).toBeLessThan(40);
  });

  it('two unrelated checkerboard sizes produce widely different hashes', () => {
    const a = computePHashFromMatrix(checkerboardMatrix(PHASH_RESIZE, 4));
    const b = computePHashFromMatrix(checkerboardMatrix(PHASH_RESIZE, 8));
    // Different check sizes => different DCT coefficients => high Hamming distance.
    const d = hammingDistance(a.hex, b.hex);
    expect(d).toBeGreaterThan(8);
  });
});

// ── Algorithm: buffer / sharp decode ─────────────────────────────────────────

describe('computePHash (buffer)', () => {
  it('throws on an empty buffer', async () => {
    await expect(computePHash(Buffer.alloc(0))).rejects.toThrow(/empty/);
  });

  it('produces a valid hex hash for a real JPEG', async () => {
    const buf = await redJpegBuffer();
    const result = await computePHash(buf);
    expect(result.hex).toMatch(/^[0-9a-f]{16}$/);
    expect(result.hex.length).toBe(PHASH_HEX_LENGTH);
  });

  it('is stable across JPEG re-encodings of the same source', async () => {
    const a = await computePHash(await redJpegBuffer());
    const b = await computePHash(await redJpegBufferLowQuality());
    const d = hammingDistance(a.hex, b.hex);
    // Same content, different quality → very low distance.
    expect(d).toBeLessThanOrEqual(2);
  });

  it('produces a far-apart hash for a visually different image', async () => {
    const red = await computePHash(await redJpegBuffer());
    const blue = await computePHash(await blueJpegBuffer());
    const d = hammingDistance(red.hex, blue.hex);
    expect(d).toBeGreaterThan(5);
  });
});

// ── hexToBits round-trip ─────────────────────────────────────────────────────

describe('hexToBits', () => {
  it('round-trips through hexToBits', async () => {
    const buf = await redJpegBuffer();
    const { hex, bits } = await computePHash(buf);
    expect(hexToBits(hex)).toBe(bits);
  });

  it('rejects malformed input', () => {
    expect(() => hexToBits('not-hex!' as never)).toThrow();
    expect(() => hexToBits('abc' as never)).toThrow(/16 characters/);
  });
});

// ── pre-warm sharp so vitest does not pay the cold-start tax mid-suite ───────

beforeAll(async () => {
  await import('sharp');
});
