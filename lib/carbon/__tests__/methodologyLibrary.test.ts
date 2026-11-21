import { describe, it, expect } from 'vitest';
import {
  CARBON_METHODOLOGIES,
  listMethodologies,
  getMethodologyById,
  calculateMethodologyCredits,
  getMethodologyLibraryStats,
  type MethodologyCategory,
} from '../methodologyLibrary';

describe('Carbon Methodology Library Database', () => {
  const REQUIRED_CATEGORIES: MethodologyCategory[] = [
    'reforestation',
    'soil_sequestration',
    'renewable_energy',
    'methane_reduction',
    'energy_efficiency',
  ];

  it('contains at least 50 carbon calculation methodologies in the library', () => {
    expect(CARBON_METHODOLOGIES.length).toBeGreaterThanOrEqual(50);
  });

  describe('Category Coverage', () => {
    it.each(REQUIRED_CATEGORIES)(
      'contains verified methodologies for %s with complete calculation formulas',
      (category) => {
        const matching = CARBON_METHODOLOGIES.filter((m) => m.category === category);
        expect(matching.length).toBeGreaterThanOrEqual(5);

        matching.forEach((m) => {
          expect(m.id).toBeTruthy();
          expect(m.code).toBeTruthy();
          expect(m.name).toBeTruthy();
          expect(m.defaultEquation).toBeTruthy();
          expect(m.baselineModel).toBeTruthy();
          expect(m.projectModel).toBeTruthy();
          expect(m.parameters.length).toBeGreaterThan(0);
          expect(typeof m.permanenceBufferPct).toBe('number');
        });
      }
    );
  });

  describe('Methodology Standards and Integrity', () => {
    it('has unique methodology identifiers', () => {
      const ids = CARBON_METHODOLOGIES.map((m) => m.id.toLowerCase());
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('covers major carbon registries (Verra, Gold Standard, UN CDM, CAR, etc.)', () => {
      const standards = new Set(CARBON_METHODOLOGIES.map((m) => m.standard));
      expect(standards.has('Verra (VCS)')).toBe(true);
      expect(standards.has('Gold Standard')).toBe(true);
      expect(standards.has('UN CDM')).toBe(true);
    });
  });

  describe('listMethodologies Query Service', () => {
    it('filters by category accurately', () => {
      const result = listMethodologies({ category: 'reforestation', limit: 100 });
      expect(result.methodologies.length).toBeGreaterThan(0);
      result.methodologies.forEach((m) => expect(m.category).toBe('reforestation'));
    });

    it('filters by standard accurately', () => {
      const result = listMethodologies({ standard: 'Gold Standard', limit: 100 });
      expect(result.methodologies.length).toBeGreaterThan(0);
      result.methodologies.forEach((m) => expect(m.standard).toBe('Gold Standard'));
    });

    it('searches by keyword across code, name, and co-benefits', () => {
      const result = listMethodologies({ search: 'solar' });
      expect(result.total).toBeGreaterThan(0);
    });

    it('supports pagination with totalPages calculation', () => {
      const page1 = listMethodologies({ limit: 10, page: 1 });
      const page2 = listMethodologies({ limit: 10, page: 2 });
      expect(page1.methodologies.length).toBe(10);
      expect(page2.methodologies.length).toBe(10);
      expect(page1.methodologies[0].id).not.toBe(page2.methodologies[0].id);
    });
  });

  describe('getMethodologyById', () => {
    it('finds methodology by case-insensitive ID or code', () => {
      const vm47 = getMethodologyById('VM0047');
      expect(vm47).toBeDefined();
      expect(vm47?.name).toContain('Afforestation');

      const lowercase = getMethodologyById('vm0047');
      expect(lowercase).toEqual(vm47);
    });

    it('returns undefined for non-existent methodology', () => {
      expect(getMethodologyById('NON_EXISTENT_ID')).toBeUndefined();
    });
  });

  describe('calculateMethodologyCredits Engine', () => {
    it('correctly calculates net carbon credits with leakage and permanence risk buffer', () => {
      // VM0047 has 15% permanence risk buffer
      const result = calculateMethodologyCredits('VM0047', {
        baselineEmissionsTonnes: 1000,
        projectEmissionsTonnes: 200,
        leakageTonnes: 100,
      });

      // Gross: 1000 - 200 = 800
      // Net after leakage: 800 - 100 = 700
      // Buffer (15% of 700): 105
      // Net credits issued: 700 - 105 = 595
      expect(result.grossReductionTonnes).toBe(800);
      expect(result.leakageTonnes).toBe(100);
      expect(result.effectivePermanenceBufferPct).toBe(15);
      expect(result.bufferDeductionTonnes).toBe(105);
      expect(result.netCreditsIssuedTonnes).toBe(595);
    });

    it('handles zero buffer methodologies (e.g. renewable energy ACM0002)', () => {
      const result = calculateMethodologyCredits('ACM0002', {
        baselineEmissionsTonnes: 500,
        projectEmissionsTonnes: 50,
        leakageTonnes: 0,
      });

      expect(result.grossReductionTonnes).toBe(450);
      expect(result.bufferDeductionTonnes).toBe(0);
      expect(result.netCreditsIssuedTonnes).toBe(450);
    });

    it('throws error for unknown methodology or negative inputs', () => {
      expect(() =>
        calculateMethodologyCredits('UNKNOWN', {
          baselineEmissionsTonnes: 100,
          projectEmissionsTonnes: 50,
        })
      ).toThrow();

      expect(() =>
        calculateMethodologyCredits('VM0047', {
          baselineEmissionsTonnes: -10,
          projectEmissionsTonnes: 50,
        })
      ).toThrow('Baseline and project emissions must be non-negative');
    });
  });

  describe('getMethodologyLibraryStats', () => {
    it('aggregates library breakdown across all 5 sectors', () => {
      const stats = getMethodologyLibraryStats();
      expect(stats.totalMethodologies).toBeGreaterThanOrEqual(50);
      expect(stats.byCategory.reforestation).toBeGreaterThan(0);
      expect(stats.byCategory.soil_sequestration).toBeGreaterThan(0);
      expect(stats.byCategory.renewable_energy).toBeGreaterThan(0);
      expect(stats.byCategory.methane_reduction).toBeGreaterThan(0);
      expect(stats.byCategory.energy_efficiency).toBeGreaterThan(0);
    });
  });
});
