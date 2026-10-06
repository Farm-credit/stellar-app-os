/**
 * Unit tests for the GHG Protocol carbon accounting engine — Issue #1432
 */

import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TRAVEL_FACTORS,
  DEFAULT_TREE_CO2_KG,
  FREIGHT_FACTORS,
  GRID_FACTORS,
  SCOPE1_STATIONARY_FACTORS,
  calculateGhgInventory,
  getGhgFactorCatalogue,
  parseGhgInventoryQuery,
  parseGhgInventoryRequest,
} from '@/lib/api/ghg-protocol';

function parseOrThrow(input: unknown) {
  const result = parseGhgInventoryRequest(input);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.data;
}

describe('parseGhgInventoryRequest', () => {
  it('rejects an empty body', () => {
    const result = parseGhgInventoryRequest({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('scope1');
    }
  });

  it('rejects negative quantities with a field path', () => {
    const result = parseGhgInventoryRequest({
      scope1: { stationary: [{ fuel: 'diesel', quantity: -5 }] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('scope1.stationary.0.quantity');
    }
  });

  it('rejects renewablePercentage outside 0–100', () => {
    const result = parseGhgInventoryRequest({
      scope2: { electricityKwh: 100, renewablePercentage: 150 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('renewablePercentage');
    }
  });

  it('rejects an inverted reporting period', () => {
    const result = parseGhgInventoryRequest({
      scope2: { electricityKwh: 1 },
      reportingPeriod: { from: '2025-12-31', to: '2025-01-01' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('reportingPeriod.to');
    }
  });

  it('rejects unknown enum values', () => {
    const result = parseGhgInventoryRequest({
      scope1: { fugitive: [{ refrigerant: 'R-9999', quantityKg: 1 }] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('refrigerant');
    }
  });

  it('accepts a full valid body', () => {
    const result = parseGhgInventoryRequest({
      reportingPeriod: { from: '2025-01-01', to: '2025-12-31' },
      organization: { name: 'Acme Reforestation', employees: 50 },
      scope1: {
        stationary: [{ fuel: 'natural-gas', quantity: 1200 }],
        mobile: [{ fuel: 'diesel', quantity: 300 }],
        fugitive: [{ refrigerant: 'R-410A', quantityKg: 12 }],
      },
      scope2: { electricityKwh: 250000, gridRegion: 'eu', renewablePercentage: 40 },
      scope3: {
        freight: [{ mode: 'truck', tonnes: 20, distanceKm: 500 }],
        waste: [{ method: 'landfill', tonnes: 4 }],
        businessTravel: { shortHaulFlights: 6, longHaulFlights: 2 },
        commuting: [{ mode: 'rail', distanceKm: 12000 }],
      },
      offsets: { creditsRetiredTonnes: 25, treesPlanted: 500 },
    });
    expect(result.ok).toBe(true);
  });
});

describe('parseGhgInventoryQuery', () => {
  it('builds a request from scalar query params', () => {
    const params = new URLSearchParams({
      'scope2.electricityKwh': '10000',
      'scope2.gridRegion': 'uk',
      'offsets.treesPlanted': '100',
      from: '2025-01-01',
      to: '2025-06-30',
    });
    const result = parseGhgInventoryQuery(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.scope2?.electricityKwh).toBe(10000);
      expect(result.data.scope2?.gridRegion).toBe('uk');
      expect(result.data.offsets?.treesPlanted).toBe(100);
      expect(result.data.reportingPeriod).toEqual({ from: '2025-01-01', to: '2025-06-30' });
    }
  });

  it('returns an error when no inventory params are present', () => {
    const result = parseGhgInventoryQuery(new URLSearchParams());
    expect(result.ok).toBe(false);
  });
});

describe('calculateGhgInventory — Scope 1', () => {
  it('computes stationary combustion from published fuel factors', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ scope1: { stationary: [{ fuel: 'natural-gas', quantity: 100 }] } })
    );

    expect(report.scope1.stationary).toHaveLength(1);
    expect(report.scope1.stationary[0].emissionsKg).toBeCloseTo(
      SCOPE1_STATIONARY_FACTORS['natural-gas'].kgCo2ePerUnit * 100,
      3
    );
    expect(report.scope1.totalKg).toBeCloseTo(531, 2);
    expect(report.scope1.totalTonnes).toBeCloseTo(0.531, 3);
  });

  it('separates mobile and stationary line items', () => {
    const report = calculateGhgInventory(
      parseOrThrow({
        scope1: {
          stationary: [{ fuel: 'natural-gas', quantity: 100 }],
          mobile: [{ fuel: 'gasoline', quantity: 10 }],
        },
      })
    );

    expect(report.scope1.stationary).toHaveLength(1);
    expect(report.scope1.mobile).toHaveLength(1);
    expect(report.scope1.mobile[0].emissionsKg).toBeCloseTo(88.87, 2);
    expect(report.scope1.totalKg).toBeCloseTo(531 + 88.87, 1);
  });

  it('computes fugitive emissions as charge × GWP', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ scope1: { fugitive: [{ refrigerant: 'R-410A', quantityKg: 2 }] } })
    );

    expect(report.scope1.fugitive[0].emissionsKg).toBeCloseTo(2 * 1924, 1);
    expect(report.scope1.totalKg).toBeCloseTo(3848, 1);
  });

  it('returns zero totals when Scope 1 is omitted', () => {
    const report = calculateGhgInventory(parseOrThrow({ offsets: { creditsRetiredTonnes: 1 } }));
    expect(report.scope1.totalKg).toBe(0);
    expect(report.scope1.totalTonnes).toBe(0);
  });
});

describe('calculateGhgInventory — Scope 2', () => {
  it('computes location-based electricity at the grid factor', () => {
    const report = calculateGhgInventory(parseOrThrow({ scope2: { electricityKwh: 10000 } }));

    expect(report.scope2.gridRegion).toBe('us-average');
    expect(report.scope2.electricityKg).toBeCloseTo(10000 * GRID_FACTORS['us-average'], 3);
    expect(report.scope2.locationBasedKg).toBeCloseTo(4170, 2);
    expect(report.scope2.locationBasedTonnes).toBeCloseTo(4.17, 3);
  });

  it('applies the selected grid region', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ scope2: { electricityKwh: 10000, gridRegion: 'uk' } })
    );
    expect(report.scope2.electricityKg).toBeCloseTo(10000 * GRID_FACTORS.uk, 3);
  });

  it('dual-reports: market-based zeroes the renewable-covered share', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ scope2: { electricityKwh: 10000, renewablePercentage: 50 } })
    );

    expect(report.scope2.locationBasedKg).toBeCloseTo(4170, 2);
    expect(report.scope2.marketBasedKg).toBeCloseTo(2085, 2);
    // Gross inventory follows the location-based figure.
    expect(report.grossEmissions.kg).toBeCloseTo(4170, 2);
  });

  it('market-based is zero for 100% renewable electricity', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ scope2: { electricityKwh: 10000, renewablePercentage: 100 } })
    );
    expect(report.scope2.marketBasedKg).toBe(0);
    expect(report.scope2.locationBasedKg).toBeCloseTo(4170, 2);
  });

  it('adds purchased heat and steam at the derived thermal factor', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ scope2: { heatKwh: 1000, steamKwh: 500 } })
    );
    expect(report.scope2.heatKg).toBeCloseTo(181, 2);
    expect(report.scope2.steamKg).toBeCloseTo(90.5, 2);
    expect(report.scope2.locationBasedKg).toBeCloseTo(271.5, 2);
  });
});

describe('calculateGhgInventory — Scope 3', () => {
  it('computes freight as tonnes × distance × mode factor', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ scope3: { freight: [{ mode: 'truck', tonnes: 10, distanceKm: 100 }] } })
    );

    const category = report.scope3.categories.find((c) => c.category === 4);
    expect(category).toBeDefined();
    expect(category!.emissionsKg).toBeCloseTo(10 * 100 * FREIGHT_FACTORS.truck, 3);
  });

  it('computes waste disposal by method', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ scope3: { waste: [{ method: 'landfill', tonnes: 2 }] } })
    );

    const category = report.scope3.categories.find((c) => c.category === 5);
    expect(category!.emissionsKg).toBeCloseTo(1160, 2);
  });

  it('computes business travel from per-trip and per-km factors', () => {
    const report = calculateGhgInventory(
      parseOrThrow({
        scope3: {
          businessTravel: { shortHaulFlights: 2, longHaulFlights: 1, railKm: 400, carKm: 200 },
        },
      })
    );

    const category = report.scope3.categories.find((c) => c.category === 6);
    const expected =
      2 * BUSINESS_TRAVEL_FACTORS.shortHaulFlightKgPerTrip +
      1 * BUSINESS_TRAVEL_FACTORS.longHaulFlightKgPerTrip +
      400 * BUSINESS_TRAVEL_FACTORS.railKgPerKm +
      200 * BUSINESS_TRAVEL_FACTORS.carKgPerKm;
    expect(category!.emissionsKg).toBeCloseTo(expected, 3);
  });

  it('computes commuting per mode', () => {
    const report = calculateGhgInventory(
      parseOrThrow({
        scope3: {
          commuting: [
            { mode: 'car', distanceKm: 1000 },
            { mode: 'walk', distanceKm: 50 },
          ],
        },
      })
    );

    const category = report.scope3.categories.find((c) => c.category === 7);
    expect(category!.emissionsKg).toBeCloseTo(171, 3);
  });

  it('only reports categories with data', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ scope3: { waste: [{ method: 'recycled', tonnes: 1 }] } })
    );
    expect(report.scope3.categories).toHaveLength(1);
    expect(report.scope3.totalKg).toBeCloseTo(50, 3);
  });
});

describe('calculateGhgInventory — totals, offsets, intensity', () => {
  it('gross = scope1 + scope2 (location-based) + scope3', () => {
    const report = calculateGhgInventory(
      parseOrThrow({
        scope1: { stationary: [{ fuel: 'natural-gas', quantity: 100 }] },
        scope2: { electricityKwh: 10000 },
        scope3: { waste: [{ method: 'landfill', tonnes: 1 }] },
      })
    );

    expect(report.grossEmissions.kg).toBeCloseTo(531 + 4170 + 580, 1);
    expect(report.grossEmissions.tonnes).toBeCloseTo(report.grossEmissions.kg / 1000, 3);
  });

  it('reports offsets separately and nets them off', () => {
    const report = calculateGhgInventory(
      parseOrThrow({
        scope2: { electricityKwh: 10000 },
        offsets: { creditsRetiredTonnes: 2, treesPlanted: 100 },
      })
    );

    expect(report.offsets.creditsRetiredTonnes).toBe(2);
    expect(report.offsets.treeSequestrationTonnes).toBeCloseTo(
      (100 * DEFAULT_TREE_CO2_KG) / 1000,
      3
    );
    expect(report.offsets.totalTonnes).toBeCloseTo(2 + 4.8, 3);
    expect(report.netEmissions.kg).toBeCloseTo(4170 - 6800, 1);
    expect(report.netEmissions.tonnes).toBeLessThan(0); // net-negative position
  });

  it('honours a custom co2KgPerTree override', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ offsets: { treesPlanted: 10, co2KgPerTree: 100 } })
    );
    expect(report.offsets.treeSequestrationTonnes).toBeCloseTo(1, 3);
  });

  it('computes per-employee intensity when employees is supplied', () => {
    const report = calculateGhgInventory(
      parseOrThrow({
        scope2: { electricityKwh: 10000 },
        organization: { name: 'Acme', employees: 10 },
      })
    );

    expect(report.intensity?.perEmployeeTonnes).toBeCloseTo(0.417, 3);
    expect(report.organization?.name).toBe('Acme');
  });

  it('omits intensity when employees is absent', () => {
    const report = calculateGhgInventory(
      parseOrThrow({ scope2: { electricityKwh: 10000 }, organization: { name: 'Acme' } })
    );
    expect(report.intensity).toBeUndefined();
  });

  it('echoes a supplied reporting period and defaults otherwise', () => {
    const withPeriod = calculateGhgInventory(
      parseOrThrow({
        offsets: { creditsRetiredTonnes: 1 },
        reportingPeriod: { from: '2024-01-01', to: '2024-12-31' },
      })
    );
    expect(withPeriod.period).toEqual({ from: '2024-01-01', to: '2024-12-31' });

    const withoutPeriod = calculateGhgInventory(
      parseOrThrow({ offsets: { creditsRetiredTonnes: 1 } })
    );
    expect(withoutPeriod.period.from).toMatch(/^\d{4}-01-01$/);
    expect(withoutPeriod.period.to).toMatch(/^\d{4}-12-31$/);
  });

  it('stamps standard metadata on every report', () => {
    const report = calculateGhgInventory(parseOrThrow({ offsets: { creditsRetiredTonnes: 1 } }));
    expect(report.standard).toBe('GHG Protocol Corporate Standard');
    expect(report.version).toBe('2.0');
    expect(() => new Date(report.generatedAt).toISOString()).not.toThrow();
  });
});

describe('getGhgFactorCatalogue', () => {
  it('publishes every factor the calculator uses', () => {
    const catalogue = getGhgFactorCatalogue();

    expect(catalogue.standard).toBe('GHG Protocol Corporate Standard');
    expect(catalogue.factors.scope1.stationary['natural-gas'].kgCo2ePerUnit).toBe(5.31);
    expect(catalogue.factors.scope1.refrigerants['R-410A']).toBe(1924);
    expect(catalogue.factors.scope2.gridRegions['us-average']).toBe(0.417);
    expect(catalogue.factors.scope3.freightKgPerTonneKm.truck).toBe(FREIGHT_FACTORS.truck);
    expect(catalogue.factors.scope3.wasteKgPerTonne.landfill).toBe(580);
    expect(catalogue.scopes['1']).toContain('Direct');
    expect(catalogue.scopes['2']).toContain('location-based');
    expect(catalogue.scopes['3']).toContain('value-chain');
  });
});
