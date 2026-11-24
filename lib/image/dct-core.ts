/**
 * Zero-dependency 2D DCT-II perceptual hash math core shared by both the
 * Node.js (`sharp`) server pipeline and browser (`Canvas` / `ImageData`)
 * instant client-side upload prechecks.
 *
 * Issue: #1931
 */

/** Resize target for the DCT input. 32×32 is the canonical size for pHash. */
export const PHASH_RESIZE = 32;

/** Top-left block of DCT coefficients to keep. */
export const PHASH_DCT_SIZE = 8;

/** Output hash width in bits. */
export const PHASH_BIT_WIDTH = PHASH_DCT_SIZE * PHASH_DCT_SIZE; // 64

/** Hex character width of a 64-bit hash (4 bits per char). */
export const PHASH_HEX_LENGTH = PHASH_BIT_WIDTH / 4; // 16

/** 64-bit unsigned mask used to coerce signed-bigint values. */
export const MASK_64 = (BigInt(1) << BigInt(64)) - BigInt(1);

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

const DCT_C: readonly number[] = (() => {
  const n = PHASH_RESIZE;
  const scale = Math.sqrt(2 / n);
  const out = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    out[k] = k === 0 ? scale / Math.SQRT2 : scale;
  }
  return out;
})();

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

/**
 * 2D DCT-II over a square `n×n` matrix via two sequential 1D passes.
 */
export function dct2D(input: Float64Array, n: number = PHASH_RESIZE): Float64Array {
  const tmp = new Float64Array(n * n);
  const out = new Float64Array(n * n);

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

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function bitsToHex(bits: readonly (0 | 1)[]): PHashHex {
  let hex = '';
  for (let i = 0; i < PHASH_BIT_WIDTH; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex as PHashHex;
}

function bitsToBigint(bits: readonly (0 | 1)[]): PHashBits {
  let value = BigInt(0);
  for (let i = 0; i < PHASH_BIT_WIDTH; i++) {
    if (bits[i] === 1) {
      value |= BigInt(1) << BigInt(PHASH_BIT_WIDTH - 1 - i);
    }
  }
  return (value & MASK_64) as PHashBits;
}

export function countOnes64(value: bigint): number {
  let v = value & MASK_64;
  let count = 0;
  while (v > BigInt(0)) {
    if ((v & BigInt(1)) === BigInt(1)) count++;
    v >>= BigInt(1);
  }
  return count;
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
 * Compute a 64-bit DCT perceptual hash from a flattened 32×32 greyscale array.
 */
export function computePHashFromGrayscale(
  matrix: Float64Array | Uint8Array | Uint8ClampedArray | readonly number[]
): PHashResult {
  if (matrix.length !== PHASH_RESIZE * PHASH_RESIZE) {
    throw new RangeError(
      `computePHashFromMatrix: expected ${PHASH_RESIZE * PHASH_RESIZE} cells, got ${matrix.length}`
    );
  }

  const flat = matrix instanceof Float64Array ? matrix : new Float64Array(matrix);
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
    population: countOnes64(bitsAsBig),
  };
}

/**
 * Convert an arbitrary `width × height` RGBA pixel buffer into a 32×32
 * greyscale matrix using bilinear interpolation and ITU-R BT.601 luminance
 * (`0.299 R + 0.587 G + 0.114 B`), compositing semi-transparent pixels over
 * white so PNG/WebP transparency behaves consistently across browsers.
 */
export function rgbaToGrayscale32x32(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Float64Array {
  if (width <= 0 || height <= 0) {
    throw new RangeError(`rgbaToGrayscale32x32: invalid dimensions ${width}×${height}`);
  }
  const expectedBytes = width * height * 4;
  if (rgba.length < expectedBytes) {
    throw new RangeError(
      `rgbaToGrayscale32x32: expected at least ${expectedBytes} RGBA bytes, got ${rgba.length}`
    );
  }

  const out = new Float64Array(PHASH_RESIZE * PHASH_RESIZE);

  const luminanceAt = (px: number, py: number): number => {
    const clampedX = Math.max(0, Math.min(width - 1, px));
    const clampedY = Math.max(0, Math.min(height - 1, py));
    const idx = (clampedY * width + clampedX) * 4;
    const alpha = rgba[idx + 3] / 255;
    const r = rgba[idx] * alpha + 255 * (1 - alpha);
    const g = rgba[idx + 1] * alpha + 255 * (1 - alpha);
    const b = rgba[idx + 2] * alpha + 255 * (1 - alpha);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  for (let ty = 0; ty < PHASH_RESIZE; ty++) {
    const sy = ((ty + 0.5) * height) / PHASH_RESIZE - 0.5;
    const y0 = Math.floor(sy);
    const y1 = y0 + 1;
    const wy = sy - y0;

    for (let tx = 0; tx < PHASH_RESIZE; tx++) {
      const sx = ((tx + 0.5) * width) / PHASH_RESIZE - 0.5;
      const x0 = Math.floor(sx);
      const x1 = x0 + 1;
      const wx = sx - x0;

      const top = luminanceAt(x0, y0) * (1 - wx) + luminanceAt(x1, y0) * wx;
      const bottom = luminanceAt(x0, y1) * (1 - wx) + luminanceAt(x1, y1) * wx;
      out[ty * PHASH_RESIZE + tx] = top * (1 - wy) + bottom * wy;
    }
  }

  return out;
}
