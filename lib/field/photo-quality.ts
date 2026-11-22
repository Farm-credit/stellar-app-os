/**
 * Photo quality validation for the field team capture app (#1640).
 *
 * Checks run on the device before upload so field staff can retake a bad shot
 * while still standing at the tree. The pixel analysis works on raw RGBA data
 * so it can be unit tested without a canvas.
 */

export const PHOTO_LIMITS = {
  /** Smaller files are almost always thumbnails or corrupt captures. */
  minBytes: 30 * 1024,
  maxBytes: 10 * 1024 * 1024,
  minWidth: 1024,
  minHeight: 768,
  /** Variance of the Laplacian on a downscaled greyscale image; lower means blurrier. */
  minSharpness: 40,
  /** Mean luminance (0-255) outside this range is too dark or blown out. */
  minBrightness: 40,
  maxBrightness: 220,
} as const;

export interface PhotoMetrics {
  bytes: number;
  width: number;
  height: number;
  sharpness: number;
  brightness: number;
}

export type PhotoIssueCode =
  'too_small_file' | 'too_large_file' | 'low_resolution' | 'blurry' | 'too_dark' | 'too_bright';

export interface PhotoIssue {
  code: PhotoIssueCode;
  message: string;
}

export interface PhotoQualityResult {
  ok: boolean;
  issues: PhotoIssue[];
}

/** Greyscale luminance (Rec. 601) for an RGBA pixel starting at `offset`. */
function luminance(data: Uint8ClampedArray | number[], offset: number): number {
  return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
}

/** Mean luminance and Laplacian-variance sharpness for RGBA pixel data. */
export function measurePixels(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number
): { sharpness: number; brightness: number } {
  if (width < 3 || height < 3 || data.length < width * height * 4) {
    return { sharpness: 0, brightness: 0 };
  }

  const grey = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0; i < grey.length; i += 1) {
    grey[i] = luminance(data, i * 4);
    sum += grey[i];
  }
  const brightness = sum / grey.length;

  let lapSum = 0;
  let lapSumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap = grey[i - width] + grey[i + width] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      lapSum += lap;
      lapSumSq += lap * lap;
      count += 1;
    }
  }
  const mean = lapSum / count;
  const sharpness = lapSumSq / count - mean * mean;

  return { sharpness, brightness };
}

export function evaluatePhotoQuality(metrics: PhotoMetrics): PhotoQualityResult {
  const issues: PhotoIssue[] = [];
  const L = PHOTO_LIMITS;

  if (metrics.bytes < L.minBytes) {
    issues.push({ code: 'too_small_file', message: 'The photo file is too small. Retake it.' });
  }
  if (metrics.bytes > L.maxBytes) {
    issues.push({ code: 'too_large_file', message: 'The photo is larger than 10 MB.' });
  }
  // Orientation should not matter, so compare the long and short edges.
  const long = Math.max(metrics.width, metrics.height);
  const short = Math.min(metrics.width, metrics.height);
  if (long < L.minWidth || short < L.minHeight) {
    issues.push({
      code: 'low_resolution',
      message: `Resolution is too low. Use at least ${L.minWidth}×${L.minHeight}.`,
    });
  }
  if (metrics.sharpness < L.minSharpness) {
    issues.push({ code: 'blurry', message: 'The photo is blurry. Hold steady and retake it.' });
  }
  if (metrics.brightness < L.minBrightness) {
    issues.push({ code: 'too_dark', message: 'The photo is too dark. Find better light.' });
  }
  if (metrics.brightness > L.maxBrightness) {
    issues.push({ code: 'too_bright', message: 'The photo is overexposed. Avoid direct glare.' });
  }

  return { ok: issues.length === 0, issues };
}
