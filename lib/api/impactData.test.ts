import assert from 'node:assert/strict';
import test from 'node:test';
import { toRegionMarker } from './impactData';

test('toRegionMarker converts live region aggregates into map markers', () => {
  const marker = toRegionMarker({
    regionKey: 'abc123',
    lat: 12.25,
    lng: 8.5,
    treesPlanted: 120,
    farmers: 3,
  });

  assert.equal(marker.id, 'abc123');
  assert.equal(marker.name, 'Privacy-preserving region 1');
  assert.equal(marker.lat, 12.25);
  assert.equal(marker.lng, 8.5);
  assert.equal(marker.treesPlanted, 120);
  assert.equal(marker.farmers, 3);
});
