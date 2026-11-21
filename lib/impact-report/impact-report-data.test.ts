import { describe, it, expect } from 'vitest';
import { buildImpactReportData } from '../impact-report-data';
import { getSponsorPortfolio } from '@/lib/api/sponsor-portfolio';

const ADDRESS = 'GCAWKY2T5OBVWRJZXYY6M7O63H4NPRW5Z2UJV3X7O7WJZL6QT6E342DT';
const NOW = new Date('2026-10-21T10:00:00Z');

describe('buildImpactReportData', () => {
  const portfolio = getSponsorPortfolio(ADDRESS, { totalTrees: 200, totalCo2OffsetTonnes: 10 });

  it('summarises trees, CO2, species and regions', () => {
    const data = buildImpactReportData({ name: 'Acme EcoSolutions', address: ADDRESS }, portfolio, NOW);
    expect(data.totalTrees).toBe(200);
    expect(data.totalCo2Tonnes).toBeCloseTo(10, 0);
    expect(data.speciesCount).toBe(portfolio.forest.totalSpecies);
    expect(data.regionCount).toBe(portfolio.forest.totalRegions);
    expect(data.reportYear).toBe(2026);
  });

  it('personalises with the sponsor name and falls back to a short address', () => {
    expect(buildImpactReportData({ name: 'Acme', address: ADDRESS }, portfolio, NOW).sponsorName).toBe('Acme');
    expect(buildImpactReportData({ address: ADDRESS }, portfolio, NOW).sponsorName).toBe('GCAWKY...42DT');
  });

  it('computes breakdown percentages that sum to ~100', () => {
    const data = buildImpactReportData({ address: ADDRESS }, portfolio, NOW);
    const sum = (rows: { percent: number }[]) => rows.reduce((s, r) => s + r.percent, 0);
    expect(sum(data.speciesBreakdown)).toBeGreaterThan(99);
    expect(sum(data.speciesBreakdown)).toBeLessThan(101);
    expect(sum(data.regionBreakdown)).toBeGreaterThan(99);
  });
});
