import { describe, expect, it } from 'vitest';
import { FARMER_GUIDES, searchFarmerGuides } from './farmerGuides';

describe('farmer guides', () => {
  it('ships all requested guide topics', () => {
    expect(FARMER_GUIDES.map((guide) => guide.slug)).toEqual([
      'regenerative-agriculture',
      'soil-testing',
      'carbon-measurement',
      'grant-applications',
      'certification-process',
    ]);
    expect(
      FARMER_GUIDES.every((guide) => guide.steps.length >= 4 && guide.resources.length >= 2)
    ).toBe(true);
  });

  it('searches guide content and filters by category', () => {
    expect(searchFarmerGuides('prohibited-input').map((guide) => guide.slug)).toEqual([
      'certification-process',
    ]);
    expect(searchFarmerGuides('', 'Measurement')).toHaveLength(2);
  });
});
