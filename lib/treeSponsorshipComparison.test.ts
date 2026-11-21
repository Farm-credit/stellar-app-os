// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import { describe, expect, it } from 'vitest';
import {
  MAX_COMPARE_PROJECTS,
  MOCK_TREE_SPONSORSHIP_OFFERINGS,
  SPONSORSHIP_METRICS,
  formatSponsorshipMetric,
  getAllTreeSponsorshipOfferings,
  getTreeSponsorshipOfferingById,
  normalizeSponsorshipProjectIds,
  sortSponsorshipOfferings,
  type TreeSponsorshipOffering,
} from './treeSponsorshipComparison';

describe('treeSponsorshipComparison domain logic', () => {
  it('defines the five required comparison metrics (cost, species, CO2, survival rate, location)', () => {
    const metricIds = SPONSORSHIP_METRICS.map((m) => m.id);
    expect(metricIds).toContain('cost');
    expect(metricIds).toContain('species');
    expect(metricIds).toContain('co2');
    expect(metricIds).toContain('survivalRate');
    expect(metricIds).toContain('location');
    expect(metricIds).toHaveLength(5);
  });

  it('enforces a maximum of four projects compared simultaneously', () => {
    expect(MAX_COMPARE_PROJECTS).toBe(4);
    const excessiveIds = ['proj-001', 'proj-004', 'proj-005', 'proj-006', 'proj-007', 'proj-009'];
    const normalized = normalizeSponsorshipProjectIds(excessiveIds);
    expect(normalized).toHaveLength(4);
    expect(normalized).toEqual(['proj-001', 'proj-004', 'proj-005', 'proj-006']);
  });

  it('normalizes project IDs by stripping whitespace, deduping, and discarding empty entries', () => {
    const raw = [' proj-001 ', '', 'proj-001', 'proj-004', '   ', 'proj-005'];
    const result = normalizeSponsorshipProjectIds(raw);
    expect(result).toEqual(['proj-001', 'proj-004', 'proj-005']);
  });

  it('retrieves offerings by ID or slug', () => {
    const byId = getTreeSponsorshipOfferingById('proj-001');
    expect(byId).toBeDefined();
    expect(byId?.projectName).toBe('Amazon Rainforest Reforestation');

    const bySlug = getTreeSponsorshipOfferingById('amazon-rainforest-reforestation');
    expect(bySlug).toBeDefined();
    expect(bySlug?.id).toBe('proj-001');

    const notFound = getTreeSponsorshipOfferingById('non-existent');
    expect(notFound).toBeUndefined();
  });

  it('contains all required fields for each mock offering', () => {
    const offerings = getAllTreeSponsorshipOfferings();
    expect(offerings.length).toBeGreaterThanOrEqual(4);

    for (const offering of offerings) {
      expect(offering.id).toBeTruthy();
      expect(offering.projectName).toBeTruthy();
      expect(typeof offering.cost).toBe('number');
      expect(offering.cost).toBeGreaterThan(0);
      expect(offering.species).toBeTruthy();
      expect(typeof offering.co2).toBe('number');
      expect(offering.co2).toBeGreaterThan(0);
      expect(typeof offering.survivalRate).toBe('number');
      expect(offering.survivalRate).toBeGreaterThanOrEqual(0);
      expect(offering.survivalRate).toBeLessThanOrEqual(100);
      expect(offering.location).toBeTruthy();
    }
  });

  describe('table sorting by each metric', () => {
    const sample: TreeSponsorshipOffering[] = [
      MOCK_TREE_SPONSORSHIP_OFFERINGS[0], // proj-001: cost 18.5, species Teak, co2 22, survival 91, loc Amazon
      MOCK_TREE_SPONSORSHIP_OFFERINGS[1], // proj-004: cost 12.0, species Red Mangrove, co2 14, survival 84, loc Coastal
      MOCK_TREE_SPONSORSHIP_OFFERINGS[2], // proj-005: cost 9.5, species Moringa, co2 9, survival 78, loc Kenya
      MOCK_TREE_SPONSORSHIP_OFFERINGS[3], // proj-006: cost 13.0, species Acacia, co2 11, survival 82, loc Sahel
    ];

    it('sorts by cost (asc and desc)', () => {
      const asc = sortSponsorshipOfferings(sample, 'cost', 'asc');
      expect(asc.map((p) => p.id)).toEqual(['proj-005', 'proj-004', 'proj-006', 'proj-001']);
      expect(asc[0].cost).toBe(9.5);
      expect(asc[3].cost).toBe(18.5);

      const desc = sortSponsorshipOfferings(sample, 'cost', 'desc');
      expect(desc.map((p) => p.id)).toEqual(['proj-001', 'proj-006', 'proj-004', 'proj-005']);
    });

    it('sorts by species (asc and desc)', () => {
      const asc = sortSponsorshipOfferings(sample, 'species', 'asc');
      // Acacia (proj-006) < Moringa (proj-005) < Red Mangrove (proj-004) < Teak (proj-001)
      expect(asc.map((p) => p.id)).toEqual(['proj-006', 'proj-005', 'proj-004', 'proj-001']);

      const desc = sortSponsorshipOfferings(sample, 'species', 'desc');
      expect(desc.map((p) => p.id)).toEqual(['proj-001', 'proj-004', 'proj-005', 'proj-006']);
    });

    it('sorts by CO2 (asc and desc)', () => {
      const asc = sortSponsorshipOfferings(sample, 'co2', 'asc');
      // 9 (proj-005) < 11 (proj-006) < 14 (proj-004) < 22 (proj-001)
      expect(asc.map((p) => p.id)).toEqual(['proj-005', 'proj-006', 'proj-004', 'proj-001']);

      const desc = sortSponsorshipOfferings(sample, 'co2', 'desc');
      expect(desc.map((p) => p.id)).toEqual(['proj-001', 'proj-004', 'proj-006', 'proj-005']);
    });

    it('sorts by survival rate (asc and desc)', () => {
      const asc = sortSponsorshipOfferings(sample, 'survivalRate', 'asc');
      // 78% (proj-005) < 82% (proj-006) < 84% (proj-004) < 91% (proj-001)
      expect(asc.map((p) => p.id)).toEqual(['proj-005', 'proj-006', 'proj-004', 'proj-001']);

      const desc = sortSponsorshipOfferings(sample, 'survivalRate', 'desc');
      // 91% (proj-001) > 84% (proj-004) > 82% (proj-006) > 78% (proj-005)
      expect(desc.map((p) => p.id)).toEqual(['proj-001', 'proj-004', 'proj-006', 'proj-005']);
    });

    it('sorts by location (asc and desc)', () => {
      const asc = sortSponsorshipOfferings(sample, 'location', 'asc');
      // 'Amazon Basin, Brazil' < 'Coastal Regions, Indonesia' < 'Kenya, East Africa' < 'Sahel Region, Senegal'
      expect(asc.map((p) => p.id)).toEqual(['proj-001', 'proj-004', 'proj-005', 'proj-006']);

      const desc = sortSponsorshipOfferings(sample, 'location', 'desc');
      expect(desc.map((p) => p.id)).toEqual(['proj-006', 'proj-005', 'proj-004', 'proj-001']);
    });
  });

  describe('formatting metric values', () => {
    const item = MOCK_TREE_SPONSORSHIP_OFFERINGS[0]; // proj-001

    it('formats cost as currency string', () => {
      expect(formatSponsorshipMetric(item, 'cost')).toBe('$18.50');
    });

    it('formats species', () => {
      expect(formatSponsorshipMetric(item, 'species')).toBe('Teak (Tectona grandis)');
    });

    it('formats CO2 with unit', () => {
      expect(formatSponsorshipMetric(item, 'co2')).toBe('22 kg CO₂/yr');
    });

    it('formats survival rate with percentage', () => {
      expect(formatSponsorshipMetric(item, 'survivalRate')).toBe('91%');
    });

    it('formats location', () => {
      expect(formatSponsorshipMetric(item, 'location')).toBe('Amazon Basin, Brazil');
    });
  });
});
