import { describe, expect, it } from 'vitest';
import {
  SAMPLE_SURVEYS,
  buildCoverageSeries,
  buildHeightHistogram,
  buildSpeciesMix,
  filterBySource,
  growthRatePctPerYear,
  summarize,
  surveysToCsv,
} from './analytics';

describe('canopy analytics', () => {
  it('computes coverage percentage series sorted by date', () => {
    const series = buildCoverageSeries([...SAMPLE_SURVEYS].reverse());
    expect(series[0].date).toBe('2023-03-15');
    expect(series[0].coveragePercent).toBe(18);
    expect(series[series.length - 1].coveragePercent).toBe(69);
  });

  it('bins heights into a histogram', () => {
    const bins = buildHeightHistogram([0.5, 1.5, 2.5, 5], 2);
    expect(bins.map((b) => b.count)).toEqual([2, 1, 1]);
    expect(buildHeightHistogram([])).toEqual([]);
  });

  it('computes growth rate and summary', () => {
    expect(growthRatePctPerYear(SAMPLE_SURVEYS)).toBeCloseTo(17, 0);
    expect(growthRatePctPerYear([])).toBe(0);
    expect(summarize(SAMPLE_SURVEYS).surveyCount).toBe(4);
    expect(summarize([]).latestCoveragePercent).toBe(0);
  });

  it('filters by source and builds species mix', () => {
    expect(filterBySource(SAMPLE_SURVEYS, 'lidar')).toHaveLength(2);
    expect(filterBySource(SAMPLE_SURVEYS, 'all')).toHaveLength(4);
    expect(buildSpeciesMix(undefined)).toEqual([]);
  });

  it('exports CSV with header and one row per survey', () => {
    const lines = surveysToCsv(SAMPLE_SURVEYS).trim().split('\r\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('coverage_percent');
    expect(lines[0]).toContain('species_mahogany_percent');
  });
});
