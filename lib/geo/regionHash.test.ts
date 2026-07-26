import { describe, it, expect } from 'vitest';
import { buildRegionHash, hashRegionKey, regionCenter } from './regionHash';

describe('regionCenter', () => {
  it('snaps raw GPS to a public grid cell center', () => {
    const center = regionCenter({ lat: 10.74, lon: -1.22 });

    expect(center.lat).toBe(10.75);
    expect(center.lon).toBe(-1.25);
  });
});

describe('hashRegionKey', () => {
  it('produces a stable opaque HMAC for a snapped grid cell', () => {
    const originalSecret = process.env.REGION_HASH_SECRET;
    process.env.REGION_HASH_SECRET = 'test-secret';

    try {
      const hashA = hashRegionKey({ lat: 10.74, lon: -1.22 });
      const hashB = hashRegionKey({ lat: 10.74, lon: -1.22 });
      const hashC = hashRegionKey({ lat: 10.26, lon: -0.78 });

      expect(hashA).toBe(hashB);
      expect(hashA).not.toBe(hashC);
      expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      process.env.REGION_HASH_SECRET = originalSecret;
    }
  });
});

describe('buildRegionHash', () => {
  it('returns a public center and opaque region key', () => {
    const originalSecret = process.env.REGION_HASH_SECRET;
    process.env.REGION_HASH_SECRET = 'test-secret';

    try {
      const result = buildRegionHash({ lat: 10.74, lon: -1.22 });

      expect(result.centerLat).toBe(10.75);
      expect(result.centerLon).toBe(-1.25);
      expect(result.regionKey.length).toBeGreaterThan(0);
      expect(result.regionKey).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      process.env.REGION_HASH_SECRET = originalSecret;
    }
  });
});
