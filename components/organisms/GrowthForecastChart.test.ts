import { describe, expect, it } from 'vitest';
import { ageInYears, speciesToSlug } from './GrowthForecastChart';

describe('GrowthForecastChart helpers', () => {
  it('maps display species names to catalogue slugs', () => {
    expect(speciesToSlug('Teak')).toBe('teak');
    expect(speciesToSlug('Bamboo (Moso)')).toBe('bamboo');
    expect(speciesToSlug('African Locust Bean')).toBe('locust_bean');
  });

  it('calculates completed planting years and handles missing dates', () => {
    const now = new Date('2026-08-28T00:00:00Z');
    expect(ageInYears('2024-08-27T00:00:00Z', now)).toBe(2);
    expect(ageInYears('2026-08-29T00:00:00Z', now)).toBe(0);
    expect(ageInYears(undefined, now)).toBe(0);
  });
});