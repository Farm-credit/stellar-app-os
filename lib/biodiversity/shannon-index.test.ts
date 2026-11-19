/**
 * Tests for Shannon Diversity Index Calculator
 */

import { describe, it, expect } from 'vitest';
import {
  calculateShannonIndex,
  compareBiodiversity,
  calculateBiodiversityTrend,
  type SpeciesCount,
  type AnnualCensusData,
} from './shannon-index';

describe('calculateShannonIndex', () => {
  it('calculates index for single species', () => {
    const data: SpeciesCount[] = [{ speciesId: '1', speciesName: 'Oak', count: 100 }];
    const result = calculateShannonIndex(data);
    expect(result.shannonIndex).toBe(0);
    expect(result.speciesRichness).toBe(1);
    expect(result.totalIndividuals).toBe(100);
    expect(result.evenness).toBe(0);
  });

  it('calculates index for multiple species', () => {
    const data: SpeciesCount[] = [
      { speciesId: '1', speciesName: 'Oak', count: 50 },
      { speciesId: '2', speciesName: 'Pine', count: 30 },
      { speciesId: '3', speciesName: 'Maple', count: 20 },
    ];
    const result = calculateShannonIndex(data);
    expect(result.shannonIndex).toBeGreaterThan(0);
    expect(result.shannonIndex).toBeLessThan(2);
    expect(result.speciesRichness).toBe(3);
    expect(result.totalIndividuals).toBe(100);
    expect(result.evenness).toBeGreaterThan(0);
  });

  it('handles empty data', () => {
    const result = calculateShannonIndex([]);
    expect(result.shannonIndex).toBe(0);
    expect(result.speciesRichness).toBe(0);
    expect(result.totalIndividuals).toBe(0);
  });

  it('handles zero individuals', () => {
    const data: SpeciesCount[] = [
      { speciesId: '1', speciesName: 'Oak', count: 0 },
      { speciesId: '2', speciesName: 'Pine', count: 0 },
    ];
    const result = calculateShannonIndex(data);
    expect(result.shannonIndex).toBe(0);
    expect(result.totalIndividuals).toBe(0);
  });

  it('calculates higher index for more even distribution', () => {
    const even: SpeciesCount[] = [
      { speciesId: '1', speciesName: 'Oak', count: 33 },
      { speciesId: '2', speciesName: 'Pine', count: 33 },
      { speciesId: '3', speciesName: 'Maple', count: 34 },
    ];
    const uneven: SpeciesCount[] = [
      { speciesId: '1', speciesName: 'Oak', count: 90 },
      { speciesId: '2', speciesName: 'Pine', count: 5 },
      { speciesId: '3', speciesName: 'Maple', count: 5 },
    ];
    const evenResult = calculateShannonIndex(even);
    const unevenResult = calculateShannonIndex(uneven);
    expect(evenResult.shannonIndex).toBeGreaterThan(unevenResult.shannonIndex);
    expect(evenResult.evenness).toBeGreaterThan(unevenResult.evenness);
  });
});

describe('compareBiodiversity', () => {
  it('shows improvement when current index is higher', () => {
    const current = calculateShannonIndex([
      { speciesId: '1', speciesName: 'Oak', count: 50 },
      { speciesId: '2', speciesName: 'Pine', count: 50 },
    ]);
    const baseline = calculateShannonIndex([{ speciesId: '1', speciesName: 'Oak', count: 100 }]);
    const result = compareBiodiversity(current, baseline);
    expect(result.trend).toBe('improving');
    expect(result.change).toBeGreaterThan(0);
  });

  it('shows decline when current index is lower', () => {
    const current = calculateShannonIndex([{ speciesId: '1', speciesName: 'Oak', count: 100 }]);
    const baseline = calculateShannonIndex([
      { speciesId: '1', speciesName: 'Oak', count: 50 },
      { speciesId: '2', speciesName: 'Pine', count: 50 },
    ]);
    const result = compareBiodiversity(current, baseline);
    expect(result.trend).toBe('declining');
    expect(result.change).toBeLessThan(0);
  });

  it('shows stable when change is minimal', () => {
    const current = calculateShannonIndex([
      { speciesId: '1', speciesName: 'Oak', count: 50 },
      { speciesId: '2', speciesName: 'Pine', count: 50 },
    ]);
    const baseline = calculateShannonIndex([
      { speciesId: '1', speciesName: 'Oak', count: 51 },
      { speciesId: '2', speciesName: 'Pine', count: 49 },
    ]);
    const result = compareBiodiversity(current, baseline);
    expect(result.trend).toBe('stable');
  });

  it('handles zero baseline', () => {
    const current = calculateShannonIndex([{ speciesId: '1', speciesName: 'Oak', count: 50 }]);
    const baseline = calculateShannonIndex([]);
    const result = compareBiodiversity(current, baseline);
    expect(result.change).toBe(0);
  });
});

describe('calculateBiodiversityTrend', () => {
  it('calculates trend from multiple years', () => {
    const data: AnnualCensusData[] = [
      {
        year: 2021,
        speciesData: [{ speciesId: '1', speciesName: 'Oak', count: 100 }],
        date: '2021-01-01',
      },
      {
        year: 2022,
        speciesData: [
          { speciesId: '1', speciesName: 'Oak', count: 50 },
          { speciesId: '2', speciesName: 'Pine', count: 50 },
        ],
        date: '2022-01-01',
      },
      {
        year: 2023,
        speciesData: [
          { speciesId: '1', speciesName: 'Oak', count: 33 },
          { speciesId: '2', speciesName: 'Pine', count: 33 },
          { speciesId: '3', speciesName: 'Maple', count: 34 },
        ],
        date: '2023-01-01',
      },
    ];
    const result = calculateBiodiversityTrend(data);
    expect(result.trend).toBe('increasing');
    expect(result.averageChange).toBeGreaterThan(0);
    expect(result.years).toEqual([2021, 2022, 2023]);
    expect(result.indices.length).toBe(3);
  });

  it('handles single year data', () => {
    const data: AnnualCensusData[] = [
      {
        year: 2021,
        speciesData: [{ speciesId: '1', speciesName: 'Oak', count: 100 }],
        date: '2021-01-01',
      },
    ];
    const result = calculateBiodiversityTrend(data);
    expect(result.trend).toBe('stable');
    expect(result.averageChange).toBe(0);
  });

  it('handles empty data', () => {
    const result = calculateBiodiversityTrend([]);
    expect(result.trend).toBe('stable');
    expect(result.averageChange).toBe(0);
    expect(result.years).toEqual([]);
    expect(result.indices).toEqual([]);
  });

  it('detects decreasing trend', () => {
    const data: AnnualCensusData[] = [
      {
        year: 2021,
        speciesData: [
          { speciesId: '1', speciesName: 'Oak', count: 33 },
          { speciesId: '2', speciesName: 'Pine', count: 33 },
          { speciesId: '3', speciesName: 'Maple', count: 34 },
        ],
        date: '2021-01-01',
      },
      {
        year: 2022,
        speciesData: [{ speciesId: '1', speciesName: 'Oak', count: 100 }],
        date: '2022-01-01',
      },
    ];
    const result = calculateBiodiversityTrend(data);
    expect(result.trend).toBe('decreasing');
    expect(result.averageChange).toBeLessThan(0);
  });
});
