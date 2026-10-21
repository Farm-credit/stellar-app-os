/**
 * Tests for Planting Regions Data - Issue #1683
 */

import { describe, it, expect } from 'vitest';
import {
  mockPlantingRegions,
  ecosystemAvailability,
  getRegionById,
  getRegionsByEcosystem,
  getRegionAvailability,
} from './planting-regions';

describe('mockPlantingRegions', () => {
  it('contains regions for all ecosystem types', () => {
    const ecosystemTypes = new Set(mockPlantingRegions.map(r => r.ecosystemType));
    expect(ecosystemTypes).toContain('rainforest');
    expect(ecosystemTypes).toContain('savannah');
    expect(ecosystemTypes).toContain('mangrove');
    expect(ecosystemTypes).toContain('mountain');
  });

  it('has unique region IDs', () => {
    const ids = mockPlantingRegions.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('has valid coordinates', () => {
    mockPlantingRegions.forEach(region => {
      expect(region.coordinates.lat).toBeGreaterThanOrEqual(-90);
      expect(region.coordinates.lat).toBeLessThanOrEqual(90);
      expect(region.coordinates.lng).toBeGreaterThanOrEqual(-180);
      expect(region.coordinates.lng).toBeLessThanOrEqual(180);
    });
  });

  it('has positive capacity values', () => {
    mockPlantingRegions.forEach(region => {
      expect(region.availableCapacity).toBeGreaterThan(0);
      expect(region.totalCapacity).toBeGreaterThan(0);
      expect(region.availableCapacity).toBeLessThanOrEqual(region.totalCapacity);
    });
  });
});

describe('ecosystemAvailability', () => {
  it('has entries for all ecosystem types', () => {
    const ecosystemTypes = ecosystemAvailability.map(e => e.ecosystemType);
    expect(ecosystemTypes).toContain('rainforest');
    expect(ecosystemTypes).toContain('savannah');
    expect(ecosystemTypes).toContain('mangrove');
    expect(ecosystemTypes).toContain('mountain');
  });

  it('calculates total available capacity correctly', () => {
    ecosystemAvailability.forEach(ecosystem => {
      const expectedTotal = ecosystem.availableRegions.reduce(
        (sum, region) => sum + region.availableCapacity,
        0
      );
      expect(ecosystem.totalAvailableCapacity).toBe(expectedTotal);
    });
  });

  it('has unique icons and colors', () => {
    const icons = ecosystemAvailability.map(e => e.icon);
    const colors = ecosystemAvailability.map(e => e.color);
    expect(new Set(icons).size).toBe(icons.length);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('getRegionById', () => {
  it('returns correct region for valid ID', () => {
    const region = getRegionById('rf-001');
    expect(region).toBeDefined();
    expect(region?.id).toBe('rf-001');
    expect(region?.name).toBe('Amazon Basin');
  });

  it('returns undefined for invalid ID', () => {
    const region = getRegionById('invalid-id');
    expect(region).toBeUndefined();
  });
});

describe('getRegionsByEcosystem', () => {
  it('returns correct regions for rainforest', () => {
    const regions = getRegionsByEcosystem('rainforest');
    expect(regions).toHaveLength(3);
    regions.forEach(region => {
      expect(region.ecosystemType).toBe('rainforest');
    });
  });

  it('returns correct regions for savannah', () => {
    const regions = getRegionsByEcosystem('savannah');
    expect(regions).toHaveLength(2);
    regions.forEach(region => {
      expect(region.ecosystemType).toBe('savannah');
    });
  });

  it('returns empty array for invalid ecosystem', () => {
    const regions = getRegionsByEcosystem('invalid' as any);
    expect(regions).toEqual([]);
  });
});

describe('getRegionAvailability', () => {
  it('returns true when capacity is sufficient', () => {
    const region = getRegionById('rf-001');
    expect(region).toBeDefined();
    if (region) {
      expect(getRegionAvailability(region.id, 1000)).toBe(true);
      expect(getRegionAvailability(region.id, region.availableCapacity)).toBe(true);
    }
  });

  it('returns false when capacity is insufficient', () => {
    const region = getRegionById('rf-001');
    expect(region).toBeDefined();
    if (region) {
      expect(getRegionAvailability(region.id, region.availableCapacity + 1)).toBe(false);
      expect(getRegionAvailability(region.id, 1000000)).toBe(false);
    }
  });

  it('returns false for invalid region ID', () => {
    expect(getRegionAvailability('invalid-id', 10)).toBe(false);
  });
});
