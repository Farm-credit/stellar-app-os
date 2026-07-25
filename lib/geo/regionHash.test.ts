import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRegionHash, hashRegionKey, regionCenter } from './regionHash';

test('regionCenter snaps raw GPS to a public grid cell center', () => {
  const center = regionCenter({ lat: 10.74, lon: -1.22 });

  assert.equal(center.lat, 10.75);
  assert.equal(center.lon, -1.25);
});

test('hashRegionKey produces a stable opaque HMAC for a snapped grid cell', () => {
  const originalSecret = process.env.REGION_HASH_SECRET;
  process.env.REGION_HASH_SECRET = 'test-secret';

  try {
    const hashA = hashRegionKey({ lat: 10.74, lon: -1.22 });
    const hashB = hashRegionKey({ lat: 10.74, lon: -1.22 });
    const hashC = hashRegionKey({ lat: 10.26, lon: -0.78 });

    assert.equal(hashA, hashB);
    assert.notEqual(hashA, hashC);
    assert.ok(/^[0-9a-f]{64}$/.test(hashA));
  } finally {
    process.env.REGION_HASH_SECRET = originalSecret;
  }
});

test('buildRegionHash returns a public center and opaque region key', () => {
  const originalSecret = process.env.REGION_HASH_SECRET;
  process.env.REGION_HASH_SECRET = 'test-secret';

  try {
    const result = buildRegionHash({ lat: 10.74, lon: -1.22 });

    assert.equal(result.centerLat, 10.75);
    assert.equal(result.centerLon, -1.25);
    assert.ok(result.regionKey.length > 0);
    assert.ok(/^[0-9a-f]{64}$/.test(result.regionKey));
  } finally {
    process.env.REGION_HASH_SECRET = originalSecret;
  }
});
