import { describe, expect, it } from 'vitest';
import { DONOR_TIERS, getDonorTier, MIN_WALL_TREES } from '../tiers';

describe('getDonorTier (Issue #1656)', () => {
  it.each([
    [0, null],
    [9, null],
    [10, 'bronze'],
    [49, 'bronze'],
    [50, 'silver'],
    [199, 'silver'],
    [200, 'gold'],
    [999, 'gold'],
    [1000, 'platinum'],
    [25000, 'platinum'],
  ])('maps %i trees to %s', (trees, tier) => {
    expect(getDonorTier(trees)).toBe(tier);
  });

  it('uses the thresholds from the acceptance criteria', () => {
    expect(DONOR_TIERS.map((t) => [t.id, t.minTrees])).toEqual([
      ['platinum', 1000],
      ['gold', 200],
      ['silver', 50],
      ['bronze', 10],
    ]);
    expect(MIN_WALL_TREES).toBe(10);
  });
});
