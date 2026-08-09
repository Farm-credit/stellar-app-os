import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { getRegionPlanterAllocations, getRegionPlanterAddresses } from './region-pools';

describe('region pool allocations', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('splits a donation evenly across all active planters in a region', () => {
    process.env.NEXT_PUBLIC_REGION_POOL_NIGERIA = 'GA1,GA2,GA3';

    const allocations = getRegionPlanterAllocations(10, 'nigeria');

    expect(allocations.map((allocation) => allocation.address)).toEqual(['GA1', 'GA2', 'GA3']);
    expect(allocations.map((allocation) => allocation.amount)).toEqual([
      3.3333334, 3.3333333, 3.3333333,
    ]);
    expect(allocations.reduce((sum, allocation) => sum + allocation.amount, 0)).toBeCloseTo(10, 7);
  });

  it('returns an empty allocation list when no planters are configured for the region', () => {
    expect(getRegionPlanterAllocations(10, 'unknown')).toEqual([]);
    expect(getRegionPlanterAddresses('unknown')).toEqual([]);
  });
});
