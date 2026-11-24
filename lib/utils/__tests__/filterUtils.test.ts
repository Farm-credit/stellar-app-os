import { describe, expect, it } from 'vitest';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { createDefaultFilters } from '@/lib/types/filters';
import {
  applyFilters,
  buildFiltersUrl,
  extractUniqueValues,
  getActiveFilterCount,
  parseFiltersFromUrl,
  projectMatchesCoBenefit,
} from '@/lib/utils/filterUtils';

const all = mockCarbonProjects;
const open = createDefaultFilters({ min: 0, max: 1000 });

describe('offset project search filters (#1265)', () => {
  it('returns every project with default filters', () => {
    expect(applyFilters(all, open)).toHaveLength(all.length);
  });

  it('filters by project type', () => {
    const result = applyFilters(all, { ...open, types: ['Reforestation'] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.type === 'Reforestation')).toBe(true);
  });

  it('filters by location', () => {
    const result = applyFilters(all, { ...open, locations: ['Texas, USA'] });
    expect(result.map((p) => p.id)).toEqual(['proj-002']);
  });

  it('filters by certification standard', () => {
    const result = applyFilters(all, { ...open, certificationStandards: ['Gold Standard'] });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.verificationStatus === 'Gold Standard')).toBe(true);
  });

  it('filters by price range (inclusive)', () => {
    const result = applyFilters(all, { ...open, priceRange: { min: 38.25, max: 45.5 } });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.pricePerTon >= 38.25 && p.pricePerTon <= 45.5)).toBe(true);
  });

  it('requires all selected co-benefits', () => {
    const result = applyFilters(all, {
      ...open,
      coBenefits: ['Biodiversity', 'Water Conservation'],
    });
    expect(result.map((p) => p.id)).toContain('proj-001');
    expect(result.every((p) => projectMatchesCoBenefit(p, 'biodiversity'))).toBe(true);
    expect(result.every((p) => projectMatchesCoBenefit(p, 'water'))).toBe(true);
  });

  it('matches canonical co-benefit categories', () => {
    const project = {
      ...all[0],
      coBenefits: ['Wildlife Corridors', 'Aquifer Recharge', 'Soil Health'],
    };
    expect(projectMatchesCoBenefit(project, 'biodiversity')).toBe(true);
    expect(projectMatchesCoBenefit(project, 'water')).toBe(true);
    expect(projectMatchesCoBenefit(project, 'soil')).toBe(true);
    expect(projectMatchesCoBenefit(project, 'clean energy')).toBe(false);
  });

  it('combines text search with filters', () => {
    const result = applyFilters(all, {
      ...open,
      search: 'mangrove',
      certificationStandards: ['Plan Vivo'],
    });
    expect(result.map((p) => p.id)).toEqual(['proj-004']);
  });

  it('round-trips filters through the URL', () => {
    const filters = {
      search: 'forest',
      types: ['Reforestation' as const],
      locations: ['Texas, USA'],
      coBenefits: ['Biodiversity', 'Soil'],
      certificationStandards: ['Gold Standard'],
      priceRange: { min: 10, max: 60 },
    };
    expect(parseFiltersFromUrl(buildFiltersUrl(filters))).toEqual(filters);
  });

  it('ignores malformed price params', () => {
    const parsed = parseFiltersFromUrl(new URLSearchParams('minPrice=abc&maxPrice=-5'));
    expect(parsed.priceRange).toEqual({ min: 0, max: 100 });
  });

  it('counts active filters and extracts unique sorted values', () => {
    expect(
      getActiveFilterCount({
        ...createDefaultFilters(),
        types: ['Reforestation'],
        coBenefits: ['Soil', 'Water'],
        priceRange: { min: 5, max: 100 },
      })
    ).toBe(4);
    const standards = extractUniqueValues(all, (p) => p.verificationStatus);
    expect(standards).toEqual([...standards].sort());
    expect(new Set(standards).size).toBe(standards.length);
  });
});

describe('default price range (#1265)', () => {
  it('does not exclude projects priced above the default 100 sentinel', () => {
    const pricey = { ...all[0], id: 'proj-pricey', pricePerTon: 150 };
    const result = applyFilters([...all, pricey], createDefaultFilters({ min: 0, max: 100 }));
    expect(result.map((p) => p.id)).toContain('proj-pricey');
  });

  it('still enforces an explicit max below 100', () => {
    const result = applyFilters(all, { ...open, priceRange: { min: 0, max: 40 } });
    expect(result.every((p) => p.pricePerTon <= 40)).toBe(true);
  });
});
