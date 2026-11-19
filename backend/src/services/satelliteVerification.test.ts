// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Satellite Verification Service Tests
 * Issue #1429
 */

import {
  calculateAreaHectares,
  estimateJobCost,
  getSupportedProviders,
  VerificationRequest,
} from './satelliteVerification';

describe('Satellite Verification Service', () => {
  const sampleBounds = {
    north: 37.8,
    south: 37.7,
    east: -122.3,
    west: -122.5,
  };

  const sampleRequest: VerificationRequest = {
    projectId: 'test-project-1',
    bounds: sampleBounds,
    verificationType: 'tree_count',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
  };

  describe('calculateAreaHectares', () => {
    it('should calculate area for a known bounding box', () => {
      // ~0.1 degree ~ 11km at equator
      // This bounds is roughly 11km x 11km = 121 km² = 12,100 hectares
      const area = calculateAreaHectares(sampleBounds);
      expect(area).toBeGreaterThan(10000);
      expect(area).toBeLessThan(15000);
    });

    it('should return 0 for zero-area bounds', () => {
      const zeroBounds = { north: 0, south: 0, east: 0, west: 0 };
      expect(calculateAreaHectares(zeroBounds)).toBe(0);
    });
  });

  describe('estimateJobCost', () => {
    it('should estimate cost for tree_count verification', () => {
      const cost = estimateJobCost({
        ...sampleRequest,
        verificationType: 'tree_count',
      });
      expect(cost.currency).toBe('USD');
      expect(cost.estimatedCost).toBeGreaterThan(0);
    });

    it('should estimate lower cost for land_cover_change', () => {
      const treeCost = estimateJobCost({
        ...sampleRequest,
        verificationType: 'tree_count',
      });
      const landCost = estimateJobCost({
        ...sampleRequest,
        verificationType: 'land_cover_change',
      });
      expect(landCost.estimatedCost).toBeLessThan(treeCost.estimatedCost);
    });
  });

  describe('getSupportedProviders', () => {
    it('should return known satellite providers', () => {
      const providers = getSupportedProviders();
      expect(providers).toContain('sentinel-2');
      expect(providers).toContain('landsat-8');
      expect(providers).toContain('planet');
      expect(providers.length).toBe(3);
    });
  });
});