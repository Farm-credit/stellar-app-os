import { describe, expect, it } from 'vitest';
import { allocationTotal, getTransparencyRecord } from './transparency';
import {
  calculateNativeSpeciesRatio,
  isNativeSpecies,
  MINIMUM_NATIVE_SPECIES_RATIO,
} from './native-species';

describe('transparency records', () => {
  it('publishes a complete allocation that sums to 100%', () => {
    expect(allocationTotal(getTransparencyRecord().allocations)).toBe(100);
    expect(getTransparencyRecord().auditReportUrl).toBe('/transparency/audit-report');
  });
});

describe('native species policy', () => {
  it('classifies policy species and calculates the ratio', () => {
    expect(isNativeSpecies('moringa')).toBe(true);
    expect(isNativeSpecies('eucalyptus')).toBe(false);
    const ratio = calculateNativeSpeciesRatio(70, 100);
    expect(ratio.nativePercentage).toBe(70);
    expect(ratio.meetsPolicy).toBe(true);
    expect(MINIMUM_NATIVE_SPECIES_RATIO).toBe(70);
  });

  it('clamps invalid counts safely', () => {
    expect(calculateNativeSpeciesRatio(120, 100)).toMatchObject({
      nativeTrees: 100,
      nonNativeTrees: 0,
      nativePercentage: 100,
    });
    expect(calculateNativeSpeciesRatio(-1, 0).nativePercentage).toBe(0);
  });
});
