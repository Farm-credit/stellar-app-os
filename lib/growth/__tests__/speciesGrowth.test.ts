import { describe, expect, it } from 'vitest';
import {
  calculateGrowthProjection,
  getBiomeClimateEnvelope,
  scoreClimateSuitability,
} from '../speciesGrowth';
import type { SpeciesGrowthParams } from '../growthTypes';
import type { ClimateNormals } from '@/lib/climate/climateTypes';

const TEAK: SpeciesGrowthParams = {
  slug: 'teak',
  commonName: 'Teak',
  biome: 'Tropical dry forest',
  co2KgPerYearAtMaturity: 22,
  maturityYears: 20,
};

function normals(overrides: Partial<ClimateNormals> = {}): ClimateNormals {
  return {
    avgAnnualRainfallMm: 1250, // middle of Tropical dry forest's 1000-1500 range
    avgAnnualTemperatureC: 27, // middle of its 24-30 range
    monthlyRainfallMm: Array(12).fill(1250 / 12),
    monthlyTemperatureC: Array(12).fill(27),
    source: 'test-fixture',
    ...overrides,
  };
}

describe('calculateGrowthProjection', () => {
  it('starts at 0 in planting year and rises monotonically to the horizon', () => {
    const projection = calculateGrowthProjection(TEAK, null);
    expect(projection.curve[0].year).toBe(0);
    expect(projection.curve[0].annualCo2RateKg).toBe(0);
    expect(projection.curve[0].cumulativeCo2Kg).toBe(0);

    for (let i = 1; i < projection.curve.length; i++) {
      expect(projection.curve[i].annualCo2RateKg).toBeGreaterThanOrEqual(
        projection.curve[i - 1].annualCo2RateKg
      );
      expect(projection.curve[i].cumulativeCo2Kg).toBeGreaterThan(
        projection.curve[i - 1].cumulativeCo2Kg
      );
    }
  });

  it('defaults the horizon to the species maturity_years', () => {
    const projection = calculateGrowthProjection(TEAK, null);
    expect(projection.horizonYears).toBe(TEAK.maturityYears);
    expect(projection.curve).toHaveLength(TEAK.maturityYears + 1);
  });

  it('reaches ~95% of the mature-tree rate by maturity_years with no climate data', () => {
    const projection = calculateGrowthProjection(TEAK, null);
    const atMaturity = projection.curve[projection.curve.length - 1];
    expect(atMaturity.annualCo2RateKg).toBeCloseTo(TEAK.co2KgPerYearAtMaturity * 0.95, 1);
    expect(atMaturity.fractionOfMaturity).toBeCloseTo(0.95, 2);
  });

  it('respects a custom horizon and extrapolates beyond maturity', () => {
    const projection = calculateGrowthProjection(TEAK, null, 30);
    expect(projection.horizonYears).toBe(30);
    expect(projection.curve).toHaveLength(31);
    const last = projection.curve[projection.curve.length - 1];
    expect(last.annualCo2RateKg).toBeGreaterThan(TEAK.co2KgPerYearAtMaturity * 0.95);
    expect(last.annualCo2RateKg).toBeLessThanOrEqual(TEAK.co2KgPerYearAtMaturity * 1.001);
  });

  it('is climate-neutral (factor 1.0, climate null) when no normals are provided', () => {
    const projection = calculateGrowthProjection(TEAK, null);
    expect(projection.climate).toBeNull();
    expect(projection.climateSource).toBeNull();
  });

  it('boosts the curve ceiling for ideal regional climate', () => {
    const ideal = calculateGrowthProjection(TEAK, normals());
    const neutral = calculateGrowthProjection(TEAK, null);
    expect(ideal.climate).not.toBeNull();
    expect(ideal.climate!.overallScore).toBeCloseTo(1, 2);
    expect(ideal.climate!.climateFactor).toBeGreaterThan(1);

    const idealLast = ideal.curve[ideal.curve.length - 1];
    const neutralLast = neutral.curve[neutral.curve.length - 1];
    expect(idealLast.annualCo2RateKg).toBeGreaterThan(neutralLast.annualCo2RateKg);
  });

  it('reduces the curve ceiling for a poor regional climate match', () => {
    const poor = calculateGrowthProjection(
      TEAK,
      normals({ avgAnnualRainfallMm: 50, avgAnnualTemperatureC: -5 })
    );
    expect(poor.climate!.overallScore).toBeLessThan(0.2);
    expect(poor.climate!.climateFactor).toBeCloseTo(0.6, 1);

    const last = poor.curve[poor.curve.length - 1];
    expect(last.annualCo2RateKg).toBeLessThan(TEAK.co2KgPerYearAtMaturity * 0.95);
  });

  it('treats an unknown biome as climate-neutral instead of throwing', () => {
    const unknownBiome: SpeciesGrowthParams = { ...TEAK, biome: 'Not A Real Biome' };
    const projection = calculateGrowthProjection(unknownBiome, normals());
    expect(projection.climate).toBeNull();
    expect(projection.curve[projection.curve.length - 1].annualCo2RateKg).toBeCloseTo(
      TEAK.co2KgPerYearAtMaturity * 0.95,
      1
    );
  });

  it('carries the climate data source through to the projection', () => {
    const projection = calculateGrowthProjection(TEAK, normals({ source: 'NASA POWER' }));
    expect(projection.climateSource).toBe('NASA POWER');
  });
});

describe('scoreClimateSuitability', () => {
  it('scores 1.0 for rainfall/temperature within the biome envelope', () => {
    const result = scoreClimateSuitability('Tropical dry forest', normals());
    expect(result).not.toBeNull();
    expect(result!.rainfallScore).toBe(1);
    expect(result!.temperatureScore).toBe(1);
  });

  it('degrades smoothly (not a hard cliff) just outside the envelope', () => {
    const envelope = getBiomeClimateEnvelope('Tropical dry forest')!;
    const justOutside = scoreClimateSuitability(
      'Tropical dry forest',
      normals({ avgAnnualRainfallMm: envelope.rainfallMaxMm + 10 })
    );
    expect(justOutside!.rainfallScore).toBeGreaterThan(0.5);
    expect(justOutside!.rainfallScore).toBeLessThan(1);
  });

  it('returns null for a biome with no known climate envelope', () => {
    expect(scoreClimateSuitability('Made Up Biome', normals())).toBeNull();
  });

  it('keeps climateFactor within [0.6, 1.2]', () => {
    const extreme = scoreClimateSuitability(
      'Tropical dry forest',
      normals({ avgAnnualRainfallMm: 100000, avgAnnualTemperatureC: 200 })
    );
    expect(extreme!.climateFactor).toBeGreaterThanOrEqual(0.6);
    expect(extreme!.climateFactor).toBeLessThanOrEqual(1.2);
  });
});
