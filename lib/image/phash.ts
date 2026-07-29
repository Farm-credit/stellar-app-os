/**
 * Perceptual Hash (pHash) — DCT-based 64-bit image fingerprint.
 *
 * Implementation of the classic Marinalva / Christoph Zauner perceptual hash
 * algorithm used to detect near-duplicate images (resized, recompressed,
 * lightly cropped or watermarked versions of the same source photo).
 *
 * Pipeline
 * --------
 *   1.  Decode + resize the input image to 32×32 pixels, greyscale.
 *   2.  Apply a 2D Discrete Cosine Transform (DCT-II) over the 32×32 matrix.
 *   3.  Keep the top-left 8×8 block of low-frequency coefficients.
 *   4.  Compute the median of those 64 coefficients.
 *   5.  Emit a 64-bit hash where bit `i` is `1` if the i-th coefficient
 *       exceeds the median, else `0`.
 *
 * Two visually similar photos (different file size, different compression
 * level, slightly different crop / lighting) typically have a Hamming
 * distance ≤ 5–8.  Two unrelated photos almost always have a Hamming
 * distance ≫ 16.
 *
 * The result is exposed both as a 16-character lowercase hex string
 * (database friendly, stable) and as the raw `bigint` value for fast
 * in-memory comparisons.
 *
 * Reference: Zauner, C. (2010). "Implementation and Benchmarking of
 * Perceptual Image Hash Functions" — chapter 4.
 *
 * Issue: #825
 */

import sharp from 'sharp';

// ── Algorithm constants ──────────────────────────────────────────────────────

/** Resize target for the DCT input. 32×32 is the canonical size for pHash. */
export const PHASH_RESIZE = 32;

/** Top-left block of DCT coefficients to keep. */
export const PHASH_DCT_SIZE = 8;

/** Output hash width in bits. */
export const PHASH_BIT_WIDTH = PHASH_DCT_SIZE * PHASH_DCT_SIZE; // 64

/** Hex character width of a 64-bit hash (4 bits per char). */
export const PHASH_HEX_LENGTH = PHASH_BIT_WIDTH / 4; // 16

/** 64-bit unsigned mask used to coerce signed-bigint values. */
const MASK_64 = (BigInt(1) << BigInt(64)) - BigInt(1); // 0xffffffffffffffffn

// ── Public types ──────────────────────────────────────────────────────────────

/** A 16-character lowercase hex pHash value. */
export type PHashHex = string & { readonly __brand: 'PHashHex' };

/** Raw 64-bit unsigned integer representation of a pHash. */
export type PHashBits = bigint & { readonly __brand: 'PHashBits' };

export interface PHashResult {
  /** 16-character lowercase hex representation (stable, DB-friendly). */
  hex: PHashHex;
  /** Raw 64-bit bigint (fast in-memory ops). */
  bits: PHashBits;
  /** Convenience: number of `1` bits (population count). */
  population: number;
}

// ── Pre-computed DCT coefficient table ────────────────────────────────────────

/**
 * C(k) — the DCT-II normalisation factor:
 *   C(k) = 1 / √2   when k = 0
 *   C(k) = 1        otherwise
 *
 * Pre-multiplied by 1/√(2/N) so we can use a plain matrix multiply at the end.
 */
const DCT_C: readonly number[] = (() => {
  const n = PHASH_RESIZE;
  const scale = Math.sqrt(2 / n);
  const out = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    out[k] = k === 0 ? scale / Math.SQRT2 : scale;
  }
  return out;
})();

/**
 * Pre-computed DCT basis matrix `basis[u][x] = cos((2x + 1) * uπ / 2N)`.
 *
 * For a 32×32 DCT this is 1024 cosines — building it lazily each call is
 * fine for one-shot hashing, but we cache it module-level so the average
 * cost of `computePHash` is dominated by the resize + JPEG decode instead
 * of pure JS math.
 */
const DCT_BASIS: readonly Float64Array[] = (() => {
  const n = PHASH_RESIZE;
  const basis: Float64Array[] = new Array(n);
  const factor = Math.PI / (2 * n);
  for (let u = 0; u < n; u++) {
    const row = new Float64Array(n);
    for (let x = 0; x < n; x++) {
      row[x] = Math.cos((2 * x + 1) * u * factor);
    }
    basis[u] = row;
  }
  return basis;
})();

// ── DCT implementation ────────────────────────────────────────────────────────

/**
 * 2D DCT-II over a square `n×n` matrix.
 *
 * Implemented as two sequential 1D DCT passes (row then column) for O(n³)
 * complexity, which is more than fast enough for our fixed n=32 grid.
 *
 * Returns a new `n×n` matrix; the input is not mutated.
 */
function dct2D(input: Float64Array, n: number): Float64Array {
  const tmp = new Float64Array(n * n);
  const out = new Float64Array(n * n);

  // ── 1D DCT on each row ───────────────────────────────────────────────────
  for (let r = 0; r < n; r++) {
    const rowOff = r * n;
    for (let c = 0; c < n; c++) {
      let sum = 0;
      const basis = DCT_BASIS[c];
      for (let x = 0; x < n; x++) {
        sum += input[rowOff + x] * basis[x];
      }
      tmp[rowOff + c] = sum * DCT_C[c];
    }
  }

  // ── 1D DCT on each column of `tmp` → `out` ──────────────────────────────
  for (let c = 0; c < n; c++) {
    for (let r = 0; r < n; r++) {
      let sum = 0;
      const basis = DCT_BASIS[r];
      for (let y = 0; y < n; y++) {
        sum += tmp[y * n + c] * basis[y];
      }
      out[r * n + c] = sum * DCT_C[r];
    }
  }

  return out;
}

// ── Median helper ─────────────────────────────────────────────────────────────

/**
 * Median of an array of numbers.  Sorts a *copy* so the input is not mutated.
 * Returns NaN for an empty input (callers should guard against this).
 */
function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ── Bit encoding helpers ─────────────────────────────────────────────────────

/**
 * Encode 64 individual `0`/`1` bits into a 16-character lowercase hex string.
 * The bits are interpreted big-endian: bit[0] is the most significant bit of
 * the first hex character.
 */
function bitsToHex(bits: readonly (0 | 1)[]): PHashHex {
  let hex = '';
  for (let i = 0; i < PHASH_BIT_WIDTH; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex as PHashHex;
}

/** Convert the lowercase hex representation back to a bigint (for ops). */
export function hexToBits(hex: PHashHex): PHashBits {
  if (hex.length !== PHASH_HEX_LENGTH) {
    throw new RangeError(
      `pHash hex must be exactly ${PHASH_HEX_LENGTH} characters; got ${hex.length}`
    );
  }
  return (BigInt(`0x${hex}`) & MASK_64) as PHashBits;
}

/**
 * Pack a 64-element array of `0`/`1` bits into a 64-bit bigint (big-endian).
 * Used for fast in-memory Hamming distance via XOR + popcount.
 */
function bitsToBigint(bits: readonly (0 | 1)[]): PHashBits {
  let value = BigInt(0);
  for (let i = 0; i < PHASH_BIT_WIDTH; i++) {
    if (bits[i] === 1) {
      value |= BigInt(1) << BigInt(PHASH_BIT_WIDTH - 1 - i);
    }
  }
  return (value & MASK_64) as PHashBits;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the perceptual hash of an image buffer.
 *
 * @param input  Raw image bytes — any format decodable by `sharp`
 *               (JPEG, PNG, WebP, GIF, AVIF, TIFF, …).
 * @returns      Structured result with hex + bigint forms.
 *
 * @throws Error if the input cannot be decoded as an image, or if sharp
 *         produces an empty buffer.
 */
export async function computePHash(input: Buffer | Uint8Array): Promise<PHashResult> {
  if (!input || input.byteLength === 0) {
    throw new Error('computePHash: input buffer is empty');
  }

  // ── 1. Decode + resize + greyscale → 32×32 raw buffer ────────────────────
  const { data, info } = await sharp(input, { failOn: 'none' })
    .grayscale()
    .resize(PHASH_RESIZE, PHASH_RESIZE, {
      fit: 'fill',
      kernel: 'lanczos3',
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== PHASH_RESIZE || info.height !== PHASH_RESIZE) {
    // Should be impossible given the resize step above, but guard anyway.
    throw new Error(
      `computePHash: expected ${PHASH_RESIZE}×${PHASH_RESIZE} raw buffer, got ${info.width}×${info.height}`
    );
  }

  // ── 2. DCT-II over the 32×32 greyscale matrix ────────────────────────────
  const matrix = new Float64Array(PHASH_RESIZE * PHASH_RESIZE);
  for (let i = 0; i < data.length; i++) {
    matrix[i] = data[i];
  }
  const dct = dct2D(matrix, PHASH_RESIZE);

  // ── 3. Reduce to top-left 8×8 (all 64 cells, including DC) ──────────────
  const lowFreq = new Array<number>(PHASH_BIT_WIDTH);
  let k = 0;
  for (let y = 0; y < PHASH_DCT_SIZE; y++) {
    for (let x = 0; x < PHASH_DCT_SIZE; x++) {
      lowFreq[k++] = dct[y * PHASH_RESIZE + x];
    }
  }
  if (k !== PHASH_BIT_WIDTH) {
    // Sanity: the 8×8 block has exactly 64 cells.
    throw new Error(`computePHash: collected ${k} low-freq cells, expected ${PHASH_BIT_WIDTH}`);
  }

  // ── 4. Median threshold + bit emission ──────────────────────────────────
  const med = median(lowFreq);
  const bits = new Array<0 | 1>(PHASH_BIT_WIDTH);
  for (let i = 0; i < PHASH_BIT_WIDTH; i++) {
    bits[i] = lowFreq[i] > med ? 1 : 0;
  }

  const bitsAsBig = bitsToBigint(bits);

  return {
    hex: bitsToHex(bits),
    bits: bitsAsBig,
    population: countOnes(bitsAsBig),
  };
}

/**
 * Synchronous variant — exposed for tests that want to feed a pre-built
 * 32×32 greyscale matrix (skipping the sharp decode).  Use `computePHash`
 * for production code.
 *
 * @internal
 */
export function computePHashFromMatrix(matrix: readonly number[]): PHashResult {
  if (matrix.length !== PHASH_RESIZE * PHASH_RESIZE) {
    throw new RangeError(
      `computePHashFromMatrix: expected ${PHASH_RESIZE * PHASH_RESIZE} cells, got ${matrix.length}`
    );
  }
  const flat = new Float64Array(matrix);
  const dct = dct2D(flat, PHASH_RESIZE);

  const lowFreq = new Array<number>(PHASH_BIT_WIDTH);
  let k = 0;
  for (let y = 0; y < PHASH_DCT_SIZE; y++) {
    for (let x = 0; x < PHASH_DCT_SIZE; x++) {
      lowFreq[k++] = dct[y * PHASH_RESIZE + x];
    }
  }

  const med = median(lowFreq);
  const bits = new Array<0 | 1>(PHASH_BIT_WIDTH);
  for (let i = 0; i < PHASH_BIT_WIDTH; i++) {
    bits[i] = lowFreq[i] > med ? 1 : 0;
  }

  const bitsAsBig = bitsToBigint(bits);

  return {
    hex: bitsToHex(bits),
    bits: bitsAsBig,
    population: countOnes(bitsAsBig),
  };
}

// ── Internal popcount (used by both compute paths) ────────────────────────────

function countOnes(value: bigint): number {
  // Mask first to handle the case where `value` is a signed bigint in JS
  // representing an unsigned 64-bit hash with the high bit set.
  let v = value & MASK_64;
  let count = 0;
  while (v > BigInt(0)) {
    if ((v & BigInt(1)) === BigInt(1)) count++;
    v >>= BigInt(1);
  }
  return count;
}
