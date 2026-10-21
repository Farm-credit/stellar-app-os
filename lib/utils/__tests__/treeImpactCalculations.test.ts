import { describe, it, expect } from 'vitest';
import {
  calculateTreeImpact,
  formatLargeNumber,
  TREE_SPECIES_DATA,
} from '@/lib/utils/treeImpactCalculations';
import { type TreeSpecies } from '@/lib/types/tree-impact';

describe('treeImpactCalculations', () => {
  const allSpecies: TreeSpecies[] = [
    'teak',
    'moringa',
    'eucalyptus',
    'mangrove',
    'oak',
    'pine',
    'acacia',
    'bamboo',
  ];

  describe('TREE_SPECIES_DATA catalogue', () => {
    it('contains all 8 required species with valid metrics', () => {
      allSpecies.forEach((species) => {
        const data = TREE_SPECIES_DATA[species];
        expect(data).toBeDefined();
        expect(data.species).toBe(species);
        expect(data.co2PerYear).toBeGreaterThan(0);
        expect(data.waterSavedPerYear).toBeGreaterThan(0);
        expect(data.habitatRestoredM2).toBeGreaterThan(0);
        expect(data.oxygenProducedPerYear).toBeGreaterThan(0);
        expect(data.biodiversityScore).toBeGreaterThanOrEqual(0);
        expect(data.biodiversityScore).toBeLessThanOrEqual(100);
        expect(data.maturityYears).toBeGreaterThan(0);
        expect(data.nativeTo.length).toBeGreaterThan(0);
        expect(data.description.length).toBeGreaterThan(10);
      });
    });
  });

  describe('calculateTreeImpact', () => {
    it('calculates 1 oak tree for 1 year accurately', () => {
      const result = calculateTreeImpact('oak', 1, 1);
      const oakData = TREE_SPECIES_DATA.oak;

      expect(result.totalCO2).toBe(oakData.co2PerYear);
      expect(result.totalWater).toBe(oakData.waterSavedPerYear);
      expect(result.totalHabitat).toBe(oakData.habitatRestoredM2);
      expect(result.totalOxygen).toBe(oakData.oxygenProducedPerYear);
      expect(result.co2EquivalentCars).toBeCloseTo(oakData.co2PerYear / 4600, 4);
      expect(result.waterEquivalentShowers).toBeCloseTo(oakData.waterSavedPerYear / 60, 4);
    });

    it('scales CO2, water, and oxygen proportionally with treeCount and years', () => {
      const treeCount = 50;
      const years = 10;
      const result = calculateTreeImpact('teak', treeCount, years);
      const teakData = TREE_SPECIES_DATA.teak;

      expect(result.totalCO2).toBe(teakData.co2PerYear * treeCount * years);
      expect(result.totalWater).toBe(teakData.waterSavedPerYear * treeCount * years);
      expect(result.totalOxygen).toBe(teakData.oxygenProducedPerYear * treeCount * years);
    });

    it('keeps habitat restored non-cumulative over years (scales only with treeCount)', () => {
      const treeCount = 20;
      const result1Year = calculateTreeImpact('mangrove', treeCount, 1);
      const result10Years = calculateTreeImpact('mangrove', treeCount, 10);
      const mangroveData = TREE_SPECIES_DATA.mangrove;

      const expectedHabitat = mangroveData.habitatRestoredM2 * treeCount;
      expect(result1Year.totalHabitat).toBe(expectedHabitat);
      expect(result10Years.totalHabitat).toBe(expectedHabitat);
    });

    it('computes realistic equivalencies for large projects', () => {
      const result = calculateTreeImpact('eucalyptus', 1000, 10);
      expect(result.co2EquivalentCars).toBeGreaterThan(1);
      expect(result.waterEquivalentShowers).toBeGreaterThan(1000);
    });
  });

  describe('formatLargeNumber', () => {
    it('formats values under 1,000 with decimal precision', () => {
      expect(formatLargeNumber(45.5, 1)).toBe('45.5');
      expect(formatLargeNumber(999, 0)).toBe('999');
    });

    it('formats thousands with "k" suffix', () => {
      expect(formatLargeNumber(1500, 1)).toBe('1.5k');
      expect(formatLargeNumber(25000, 0)).toBe('25k');
      expect(formatLargeNumber(999999, 1)).toBe('1000.0k');
    });

    it('formats millions with "M" suffix', () => {
      expect(formatLargeNumber(1_200_000, 1)).toBe('1.2M');
      expect(formatLargeNumber(10_500_000, 2)).toBe('10.50M');
    });
  });
});
