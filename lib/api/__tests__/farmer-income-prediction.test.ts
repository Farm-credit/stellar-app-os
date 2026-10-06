import { describe, expect, it } from 'vitest';
import {
  BUFFER_POOL_SHARE,
  DEFAULT_PROJECT_YEARS,
  FARMER_REVENUE_SHARE,
  getPriceScenarios,
  parseIncomePredictionInput,
  parseIncomePredictionQuery,
  predictFarmerIncome,
  rampUpFactor,
  type IncomePredictionInput,
} from '@/lib/api/farmer-income-prediction';

const NOW = new Date('2026-09-01T00:00:00Z');

const baseInput: IncomePredictionInput = {
  landSizeHectares: 10,
  region: 'africa',
  practiceType: 'agroforestry',
  projectYears: 5,
};

describe('parseIncomePredictionInput (#1421)', () => {
  it('accepts a valid request and defaults projectYears', () => {
    const result = parseIncomePredictionInput({
      landSizeHectares: 4,
      region: 'Latin America',
      practiceType: 'Cover Cropping',
    });
    expect(result).toEqual({
      ok: true,
      data: {
        landSizeHectares: 4,
        region: 'latin-america',
        practiceType: 'cover-cropping',
        projectYears: DEFAULT_PROJECT_YEARS,
      },
    });
  });

  it('parses query-string values', () => {
    const result = parseIncomePredictionQuery(
      new URLSearchParams('landSizeHectares=2.5&region=oceania&practiceType=no-till&projectYears=3')
    );
    expect(result.ok && result.data).toEqual({
      landSizeHectares: 2.5,
      region: 'oceania',
      practiceType: 'no-till',
      projectYears: 3,
    });
  });

  it('reports every invalid field at once', () => {
    const result = parseIncomePredictionInput({
      landSizeHectares: -1,
      region: 'mars',
      practiceType: 'strip-mining',
      projectYears: 2.5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(4);
      expect(result.errors[0]).toContain('landSizeHectares');
      expect(result.errors[1]).toContain('region');
      expect(result.errors[2]).toContain('practiceType');
      expect(result.errors[3]).toContain('projectYears');
    }
  });

  it('requires land size, region and practice', () => {
    const result = parseIncomePredictionInput({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        'landSizeHectares is required',
        'region is required',
        'practiceType is required',
      ]);
    }
  });

  it('rejects non-object bodies', () => {
    expect(parseIncomePredictionInput(null).ok).toBe(false);
    expect(parseIncomePredictionInput('10 hectares').ok).toBe(false);
  });
});

describe('rampUpFactor', () => {
  it('ramps linearly and caps at the full rate', () => {
    expect(rampUpFactor(1, 4)).toBe(0.25);
    expect(rampUpFactor(2, 4)).toBe(0.5);
    expect(rampUpFactor(4, 4)).toBe(1);
    expect(rampUpFactor(9, 4)).toBe(1);
    expect(rampUpFactor(1, 1)).toBe(1);
  });
});

describe('getPriceScenarios', () => {
  it('uses the exact region and practice series when one exists', () => {
    const prices = getPriceScenarios('africa', 'Reforestation', NOW);
    expect(prices.basis).toBe('region-and-practice');
    expect(prices.months).toBeGreaterThan(12);
    expect(prices.low).toBeLessThanOrEqual(prices.expected);
    expect(prices.expected).toBeLessThanOrEqual(prices.high);
  });

  it('falls back to the practice series in another region', () => {
    expect(getPriceScenarios('north-america', 'Mangrove Restoration', NOW).basis).toBe('practice');
  });

  it('falls back to the whole market when nothing narrower matches', () => {
    expect(getPriceScenarios('north-america', 'Other', NOW).basis).toBe('market');
  });
});

describe('predictFarmerIncome (#1421)', () => {
  it('is deterministic for the same inputs and time', () => {
    expect(predictFarmerIncome(baseInput, NOW)).toEqual(predictFarmerIncome(baseInput, NOW));
  });

  it('applies land size, practice rate, region factor and buffer pool', () => {
    const prediction = predictFarmerIncome(baseInput, NOW);
    // 10 ha × 5 t/ha/yr × 1.1 (africa) × (1 − 0.2 buffer) = 44 t/yr at maturity.
    expect(prediction.sequestration.annualCreditsAtMaturity).toBe(44);
    expect(prediction.assumptions).toEqual({
      bufferPoolShare: BUFFER_POOL_SHARE,
      farmerRevenueShare: FARMER_REVENUE_SHARE,
      priceGrowth: 'flat',
    });
  });

  it('ramps credits up over the establishment period', () => {
    const { yearly } = predictFarmerIncome(baseInput, NOW);
    expect(yearly.map((year) => year.creditsTonnes)).toEqual([14.67, 29.33, 44, 44, 44]);
    expect(yearly).toHaveLength(5);
  });

  it('values credits at the farmer share of each price scenario', () => {
    const prediction = predictFarmerIncome(baseInput, NOW);
    const year3 = prediction.yearly[2];
    expect(year3.income.expected).toBeCloseTo(
      44 * prediction.prices.expected * FARMER_REVENUE_SHARE,
      1
    );
    expect(year3.income.low).toBeLessThanOrEqual(year3.income.expected);
    expect(year3.income.expected).toBeLessThanOrEqual(year3.income.high);
  });

  it('scales income with land size', () => {
    const small = predictFarmerIncome(baseInput, NOW);
    const large = predictFarmerIncome({ ...baseInput, landSizeHectares: 20 }, NOW);
    expect(large.totals.income.expected).toBeCloseTo(small.totals.income.expected * 2, 0);
    expect(large.totals.incomePerHectarePerYear.expected).toBeCloseTo(
      small.totals.incomePerHectarePerYear.expected,
      1
    );
  });

  it('predicts more for a higher-sequestration practice on the same land', () => {
    const noTill = predictFarmerIncome({ ...baseInput, practiceType: 'no-till' }, NOW);
    const mangrove = predictFarmerIncome(
      { ...baseInput, practiceType: 'mangrove-restoration' },
      NOW
    );
    expect(mangrove.totals.income.expected).toBeGreaterThan(noTill.totals.income.expected);
  });

  it('sums yearly credits into the totals', () => {
    const prediction = predictFarmerIncome(baseInput, NOW);
    const summed = prediction.yearly.reduce((sum, year) => sum + year.creditsTonnes, 0);
    expect(prediction.totals.creditsTonnes).toBeCloseTo(summed, 1);
  });
});
