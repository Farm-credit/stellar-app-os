/**
 * Perceptual Hash (pHash) — DCT-based 64-bit image fingerprint.
 *
 * Implementation of the classic Marinalva / Christoph Zauner perceptual hash
 * algorithm used to detect near-duplicate images (resized, recompressed,
 * lightly cropped or watermarked versions of the same source photo).
 *
 * Shares the pure 2D DCT-II math core with `@/lib/image/dct-core` so browser
 * prechecks and Node.js `sharp` server pipelines emit identical 64-bit hashes.
 *
 * Issue: #825 / #1931
 */

import sharp from 'sharp';
import {
  PHASH_BIT_WIDTH,
  PHASH_DCT_SIZE,
  PHASH_HEX_LENGTH,
  PHASH_RESIZE,
  computePHashFromGrayscale,
  hexToBits,
  type PHashBits,
  type PHashHex,
  type PHashResult,
} from './dct-core';

export {
  PHASH_BIT_WIDTH,
  PHASH_DCT_SIZE,
  PHASH_HEX_LENGTH,
  PHASH_RESIZE,
  hexToBits,
  type PHashBits,
  type PHashHex,
  type PHashResult,
};

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

  const { data, info } = await sharp(input, { failOn: 'none' })
    .grayscale()
    .resize(PHASH_RESIZE, PHASH_RESIZE, {
      fit: 'fill',
      kernel: 'lanczos3',
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== PHASH_RESIZE || info.height !== PHASH_RESIZE) {
    throw new Error(
      `computePHash: expected ${PHASH_RESIZE}×${PHASH_RESIZE} raw buffer, got ${info.width}×${info.height}`
    );
  }

  return computePHashFromGrayscale(data);
}

/**
 * Synchronous variant — exposed for tests that want to feed a pre-built
 * 32×32 greyscale matrix (skipping the sharp decode). Use `computePHash`
 * for production code.
 */
export function computePHashFromMatrix(matrix: readonly number[]): PHashResult {
  return computePHashFromGrayscale(matrix);
}
