import { describe, expect, it } from 'vitest';
import {
  CARBON_FRACTION,
  CLIMATE_ZONES,
  CO2_METHODOLOGY_PATH,
  CO2_PER_CARBON,
  ROOT_TO_SHOOT_RATIO,
  SPECIES_ALLOMETRY,
  aboveGroundBiomassKg,
  annualSequestrationKg,
  cumulativeCo2Kg,
  estimateTreeSequestration,
  inferClimateZone,
  sizeAtAge,
} from '../ipcc-tier1';
import { TREE_SPECIES } from '@/lib/constants/species';

describe('aboveGroundBiomassKg', () => {
  it('applies the Chave et al. (2014) equation', () => {
    // 0.0673 * (0.6 * 20^2 * 15)^0.976 = 0.0673 * 3600^0.976
    expect(aboveGroundBiomassKg(0.6, 20, 15)).toBeCloseTo(0.0673 * Math.pow(3600, 0.976), 6);
  });

  it('is zero for a tree with no size', () => {
    expect(aboveGroundBiomassKg(0.6, 0, 15)).toBe(0);
    expect(aboveGroundBiomassKg(0.6, 20, 0)).toBe(0);
  });
});

describe('cumulativeCo2Kg', () => {
  it('converts biomass to CO2 through root-to-shoot, carbon fraction and 44/12', () => {
    const { dbhCm, heightM } = sizeAtAge('Teak', 'tropical', 10);
    const agb = aboveGroundBiomassKg(SPECIES_ALLOMETRY.teak.woodDensity, dbhCm, heightM);
    const expected = agb * (1 + ROOT_TO_SHOOT_RATIO.tropical) * CARBON_FRACTION * CO2_PER_CARBON;
    expect(cumulativeCo2Kg('Teak', 'tropical', 10)).toBeCloseTo(expected, 8);
  });

  it('starts at zero and never decreases with age', () => {
    expect(cumulativeCo2Kg('Teak', 'tropical', 0)).toBe(0);
    let previous = 0;
    for (let age = 1; age <= 40; age += 1) {
      const current = cumulativeCo2Kg('Teak', 'tropical', age);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('treats a negative age as zero', () => {
    expect(cumulativeCo2Kg('Teak', 'tropical', -3)).toBe(0);
  });

  it('stores less in a slower-growing climate zone at the same age', () => {
    expect(cumulativeCo2Kg('Teak', 'temperate', 8)).toBeLessThan(
      cumulativeCo2Kg('Teak', 'tropical', 8)
    );
  });

  it('has parameters for every catalogue species and zone', () => {
    for (const species of TREE_SPECIES) {
      expect(SPECIES_ALLOMETRY[species.slug], species.slug).toBeDefined();
      for (const zone of CLIMATE_ZONES) {
        expect(cumulativeCo2Kg(species.name, zone, species.maturityYears)).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the average yearly rate over maturity close to the published species rate', () => {
    for (const species of TREE_SPECIES) {
      const average =
        cumulativeCo2Kg(species.name, 'tropical', species.maturityYears) / species.maturityYears;
      expect(average / species.co2KgPerYear, species.slug).toBeGreaterThan(0.8);
      expect(average / species.co2KgPerYear, species.slug).toBeLessThan(1.25);
    }
  });
});

describe('annualSequestrationKg', () => {
  it('changes as the tree ages', () => {
    const young = annualSequestrationKg('Teak', 'tropical', 1);
    const growing = annualSequestrationKg('Teak', 'tropical', 8);
    expect(growing).toBeGreaterThan(young);
  });

  it('equals the difference between consecutive years of stored CO2', () => {
    const expected =
      cumulativeCo2Kg('Neem', 'tropical', 4.5) - cumulativeCo2Kg('Neem', 'tropical', 3.5);
    expect(annualSequestrationKg('Neem', 'tropical', 3.5)).toBeCloseTo(expected, 8);
  });
});

describe('inferClimateZone', () => {
  it('uses coastal for mangroves and latitude otherwise', () => {
    expect(inferClimateZone('Mangrove', 52)).toBe('coastal');
    expect(inferClimateZone('Teak', 12)).toBe('tropical');
    expect(inferClimateZone('Teak', -30)).toBe('subtropical');
    expect(inferClimateZone('Teak', 45)).toBe('temperate');
  });
});

describe('estimateTreeSequestration', () => {
  const asOf = new Date('2026-03-12T08:00:00Z');

  it('reports the visible inputs and a rate that moves with age', () => {
    const planted = new Date('2024-03-12T08:00:00Z');
    const young = estimateTreeSequestration({
      species: 'Teak',
      climateZone: 'tropical',
      plantedAt: planted,
      asOf,
    });
    const older = estimateTreeSequestration({
      species: 'Teak',
      climateZone: 'tropical',
      plantedAt: planted,
      asOf: new Date('2030-03-12T08:00:00Z'),
    });

    expect(young.inputs.species).toBe('Teak');
    expect(young.inputs.climateZone).toBe('tropical');
    expect(young.inputs.ageYears).toBeCloseTo(2, 1);
    expect(older.inputs.ageYears).toBeCloseTo(6, 1);
    expect(older.annualCo2Kg).not.toBeCloseTo(young.annualCo2Kg, 3);
    expect(older.cumulativeCo2Kg).toBeGreaterThan(young.cumulativeCo2Kg);
  });

  it('treats an unplanted tree as age zero', () => {
    const result = estimateTreeSequestration({ species: 'Teak', climateZone: 'tropical', asOf });
    expect(result.inputs.ageYears).toBe(0);
    expect(result.inputs.plantedAt).toBeNull();
    expect(result.cumulativeCo2Kg).toBe(0);
  });

  it('treats a future planting date as age zero', () => {
    const result = estimateTreeSequestration({
      species: 'Teak',
      climateZone: 'tropical',
      plantedAt: '2030-01-01T00:00:00Z',
      asOf,
    });
    expect(result.inputs.ageYears).toBe(0);
  });

  it('ignores an unparseable planting date', () => {
    const result = estimateTreeSequestration({
      species: 'Teak',
      climateZone: 'tropical',
      plantedAt: 'not-a-date',
      asOf,
    });
    expect(result.inputs.plantedAt).toBeNull();
  });
});

describe('methodology link', () => {
  it('points at the published methodology page', () => {
    expect(CO2_METHODOLOGY_PATH).toBe('/methodologies/ipcc-tier1');
  });
});
