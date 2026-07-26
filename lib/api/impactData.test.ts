import { describe, it, expect } from 'vitest';
import { toRegionMarker } from './impactData';

describe('toRegionMarker', () => {
  it('converts live region aggregates into map markers', () => {
    const marker = toRegionMarker({
      regionKey: 'abc123',
      lat: 12.25,
      lng: 8.5,
      treesPlanted: 120,
      farmers: 3,
    });

    expect(marker.id).toBe('abc123');
    expect(marker.name).toBe('Privacy-preserving region 1');
    expect(marker.lat).toBe(12.25);
    expect(marker.lng).toBe(8.5);
    expect(marker.treesPlanted).toBe(120);
    expect(marker.farmers).toBe(3);
  });
});
