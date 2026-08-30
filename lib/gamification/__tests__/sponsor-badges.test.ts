import { describe, expect, it } from 'vitest';
import {
  getHighestSponsorBadge,
  getSponsorBadges,
  hasSponsorBadge,
} from '@/lib/gamification/sponsor-badges';

describe('sponsor badges', () => {
  it.each([
    [0, []],
    [1, ['bronze']],
    [9, ['bronze']],
    [10, ['bronze', 'silver']],
    [49, ['bronze', 'silver']],
    [50, ['bronze', 'silver', 'gold']],
    [99, ['bronze', 'silver', 'gold']],
    [100, ['bronze', 'silver', 'gold', 'platinum']],
  ])('awards the correct badges at %i trees', (treeCount, expected) => {
    expect(getSponsorBadges(treeCount).map((badge) => badge.id)).toEqual(expected);
  });

  it('returns the highest earned badge', () => {
    expect(getHighestSponsorBadge(75)?.id).toBe('gold');
    expect(getHighestSponsorBadge(0)).toBeNull();
  });

  it('handles non-finite counts without awarding badges', () => {
    expect(getSponsorBadges(Number.NaN)).toEqual([]);
    expect(hasSponsorBadge(Number.POSITIVE_INFINITY, 'platinum')).toBe(false);
  });
});
