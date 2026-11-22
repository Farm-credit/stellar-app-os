import { describe, expect, it } from 'vitest';
import { calculateCarbonProfile } from './calculator';

const household = {
  householdSize: 2,
  region: 'us_average',
  electricityKwh: 1000,
  naturalGasKwh: 0,
  heatingOilKwh: 0,
  propaneKwh: 0,
};

describe('calculateCarbonProfile', () => {
  it('calculates household, vehicle, diet, and flight impact independently', () => {
    const result = calculateCarbonProfile({
      household,
      vehicle: { vehicleCount: 1, vehicleType: 'electric', annualKm: 1000 },
      diet: { dietType: 'vegan' },
      flight: { flightCount: 1, flightType: 'long_haul', averageDistanceKM: 100 },
      creditPriceUSD: 20,
    });

    expect(result.breakdown.householdElectricity).toBe(393);
    expect(result.breakdown.vehicle).toBeCloseTo(9.54);
    expect(result.breakdown.diet).toBeCloseTo(2.76);
    expect(result.breakdown.flight).toBeCloseTo(11);
    expect(result.totalTC02e).toBeCloseTo(416.3);
    expect(result.creditsNeeded).toBe(417);
    expect(result.estimatedCostUSD).toBe(8340);
    expect(result.comparisonToRegionAverage.regionAverageTCO2e).toBeCloseTo(28.8);
  });

  it('uses safe defaults for invalid numeric input and omits optional categories', () => {
    const result = calculateCarbonProfile({
      household: {
        householdSize: Number.NaN,
        region: 'global_average',
        electricityKwh: -100,
      },
    });

    expect(result.breakdown.householdElectricity).toBe(1900);
    expect(result.breakdown.vehicle).toBe(0);
    expect(result.breakdown.diet).toBe(0);
    expect(result.breakdown.flight).toBe(0);
    expect(result.perCapitaTC2e).toBe(1900);
  });
});
