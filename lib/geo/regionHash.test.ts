import { describe, it, expect } from 'vitest';
import { buildRegionHash, hashRegionKey, regionCenter } from './regionHash';

describe('regionHash', () => {
  it('regionCenter snaps raw GPS to a public grid cell center', () => {
    const center = regionCenter({ lat: 10.74, lon: -1.22 });

    expect(center.lat).toBe(10.75);
    expect(center.lon).toBe(-1.25);
  });

  it('hashRegionKey produces a stable opaque HMAC for a snapped grid cell', () => {
    const originalSecret = process.env.REGION_HASH_SECRET;
    process.env.REGION_HASH_SECRET = 'test-secret';

    try {
      const hashA = hashRegionKey({ lat: 10.74, lon: -1.22 });
      const hashB = hashRegionKey({ lat: 10.74, lon: -1.22 });
      const hashC = hashRegionKey({ lat: 10.26, lon: -0.78 });

      expect(hashA).toBe(hashB);
      expect(hashA).not.toBe(hashC);
      expect(/^[0-9a-f]{64}$/.test(hashA)).toBe(true);
    } finally {
      process.env.REGION_HASH_SECRET = originalSecret;
    }
  });

  it('buildRegionHash returns a public center and opaque region key', () => {
    const originalSecret = process.env.REGION_HASH_SECRET;
    process.env.REGION_HASH_SECRET = 'test-secret';

    try {
      const result = buildRegionHash({ lat: 10.74, lon: -1.22 });

      expect(result.centerLat).toBe(10.75);
      expect(result.centerLon).toBe(-1.25);
      expect(result.regionKey.length).toBeGreaterThan(0);
      expect(/^[0-9a-f]{64}$/.test(result.regionKey)).toBe(true);
    } finally {
      process.env.REGION_HASH_SECRET = originalSecret;
    }
  });
});
