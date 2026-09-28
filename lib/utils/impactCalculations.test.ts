import { describe, expect, it } from 'vitest';
import { DEFAULT_ENERGY, DEFAULT_LIFESTYLE, DEFAULT_TRAVEL } from '@/lib/types/impact-calculator';
import { calculateEnergyEmissions, calculateImpact } from './impactCalculations';

describe('individual carbon impact calculations', () => {
  it('attributes household energy equally to each household member', () => {
    const sharedHome = {
      ...DEFAULT_ENERGY,
      householdSize: 2,
      electricityKwhPerMonth: 1_000,
      gasThermPerMonth: 0,
    };
    const singleOccupantHome = { ...sharedHome, householdSize: 1 };

    expect(calculateEnergyEmissions(sharedHome)).toBeCloseTo(
      calculateEnergyEmissions(singleOccupantHome) / 2
    );
  });

  it('treats an invalid household size as a single-person household', () => {
    const invalidHousehold = { ...DEFAULT_ENERGY, householdSize: 0 };
    const singleOccupantHome = { ...DEFAULT_ENERGY, householdSize: 1 };

    expect(calculateEnergyEmissions(invalidHousehold)).toBe(
      calculateEnergyEmissions(singleOccupantHome)
    );
  });

  it('recommends one whole credit for every tonne of the individual annual footprint', () => {
    const result = calculateImpact(
      { ...DEFAULT_TRAVEL, shortFlightsPerYear: 0, longFlightsPerYear: 0, carMilesPerWeek: 100 },
      { ...DEFAULT_ENERGY, householdSize: 4, electricityKwhPerMonth: 1_000, gasThermPerMonth: 0 },
      DEFAULT_LIFESTYLE
    );

    expect(result.totalEmissions).toBeGreaterThan(0);
    expect(result.recommendedCredits).toBe(Math.ceil(result.totalEmissions));
  });
});
