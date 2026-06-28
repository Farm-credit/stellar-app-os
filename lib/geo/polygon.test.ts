import { describe, expect, it } from 'vitest';
import { checkRegionCoverage, containsPointInPolygon } from './polygon';

describe('containsPointInPolygon', () => {
  it('returns true for a point inside a simple polygon', () => {
    const polygon = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as [number, number][];

    expect(containsPointInPolygon(5, 5, polygon)).toBe(true);
    expect(containsPointInPolygon(11, 5, polygon)).toBe(false);
  });
});

describe('checkRegionCoverage', () => {
  it('matches the northern nigeria sample polygon', () => {
    expect(checkRegionCoverage({ latitude: 12.0, longitude: 8.5, regionCode: 'northern-nigeria' })).toBe(true);
    expect(checkRegionCoverage({ latitude: 4.0, longitude: 3.0, regionCode: 'northern-nigeria' })).toBe(true);
    expect(checkRegionCoverage({ latitude: 2.5, longitude: 4.0, regionCode: 'northern-nigeria' })).toBe(false);
    expect(checkRegionCoverage({ latitude: 10.0, longitude: 2.0, regionCode: 'unknown' })).toBe(false);
  });
});
