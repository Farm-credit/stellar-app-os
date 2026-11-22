import { describe, expect, it } from 'vitest';
import {
  PHOTO_LIMITS,
  evaluatePhotoQuality,
  measurePixels,
  type PhotoMetrics,
} from '../photo-quality';

function pixels(w: number, h: number, fn: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

const good: PhotoMetrics = {
  bytes: 500_000,
  width: 2000,
  height: 1500,
  sharpness: 200,
  brightness: 120,
};

describe('measurePixels', () => {
  it('reports zero sharpness for a flat image', () => {
    const { sharpness, brightness } = measurePixels(
      pixels(32, 32, () => 128),
      32,
      32
    );
    expect(sharpness).toBe(0);
    expect(brightness).toBeCloseTo(128, 0);
  });

  it('reports high sharpness for a checkerboard', () => {
    const { sharpness } = measurePixels(
      pixels(32, 32, (x, y) => ((x + y) % 2 === 0 ? 0 : 255)),
      32,
      32
    );
    expect(sharpness).toBeGreaterThan(PHOTO_LIMITS.minSharpness);
  });

  it('returns zeros for degenerate input', () => {
    expect(measurePixels(new Uint8ClampedArray(0), 0, 0)).toEqual({ sharpness: 0, brightness: 0 });
  });
});

describe('evaluatePhotoQuality', () => {
  it('accepts a good photo', () => {
    expect(evaluatePhotoQuality(good)).toEqual({ ok: true, issues: [] });
  });

  it('flags each failure independently', () => {
    const codes = (m: Partial<PhotoMetrics>) =>
      evaluatePhotoQuality({ ...good, ...m }).issues.map((i) => i.code);
    expect(codes({ bytes: 100 })).toEqual(['too_small_file']);
    expect(codes({ bytes: PHOTO_LIMITS.maxBytes + 1 })).toEqual(['too_large_file']);
    expect(codes({ width: 640, height: 480 })).toEqual(['low_resolution']);
    expect(codes({ sharpness: 5 })).toEqual(['blurry']);
    expect(codes({ brightness: 10 })).toEqual(['too_dark']);
    expect(codes({ brightness: 250 })).toEqual(['too_bright']);
  });

  it('accepts portrait orientation of an acceptable resolution', () => {
    expect(evaluatePhotoQuality({ ...good, width: 1500, height: 2000 }).ok).toBe(true);
  });
});
