import { describe, expect, it } from 'vitest';
import {
  AR_PROJECTION_YEARS,
  ageInYears,
  buildTreeARProjection,
  formatHeight,
  maturityLabel,
  projectionScale,
  projectionYearAt,
} from './projection';
import type { Tree } from '@/lib/types/tree';

const plantedTree: Tree = {
  id: 'tree-001',
  treeId: 'HRV-2024-0001',
  species: 'Teak',
  region: 'Kano, Nigeria',
  status: 'verified',
  plantedAt: '2024-03-12T08:00:00Z',
  lat: 12.04,
  lng: 8.48,
  co2OffsetKgPerYear: 22,
  projectName: 'Northern Savanna Reforestation',
};

const NOW = Date.UTC(2026, 8, 1);

describe('buildTreeARProjection', () => {
  it('projects every year from planting to maturity', () => {
    const projection = buildTreeARProjection(plantedTree, { nowMs: NOW });

    expect(projection.timeline).toHaveLength(AR_PROJECTION_YEARS + 1);
    projection.timeline.forEach((entry, index) => expect(entry.year).toBe(index));
  });

  it('grows monotonically and reaches full size at maturity', () => {
    const projection = buildTreeARProjection(plantedTree, { nowMs: NOW });

    for (let year = 1; year <= AR_PROJECTION_YEARS; year += 1) {
      expect(projection.timeline[year].heightCm).toBeGreaterThan(
        projection.timeline[year - 1].heightCm
      );
    }
    expect(projection.timeline[AR_PROJECTION_YEARS].maturityProgress).toBe(1);
    expect(projection.timeline[AR_PROJECTION_YEARS].scale).toBe(1);
  });

  it('normalises the overlay scale against the mature height', () => {
    const projection = buildTreeARProjection(plantedTree, { nowMs: NOW });
    const mature = projection.matureHeightCm;

    expect(projection.timeline[0].scale).toBe(0);
    expect(projection.timeline[10].scale).toBeCloseTo(
      projectionScale(projection.timeline[10].heightCm, mature),
      5
    );
    expect(projection.timeline[10].scale).toBeGreaterThan(0);
    expect(projection.timeline[10].scale).toBeLessThan(1);
  });

  it('opens on maturity so the sponsor sees the promise of the tree', () => {
    const projection = buildTreeARProjection(plantedTree, { nowMs: NOW });
    expect(projection.defaultYear).toBe(AR_PROJECTION_YEARS);
  });

  it('works out the tree age today', () => {
    const projection = buildTreeARProjection(plantedTree, { nowMs: NOW });

    expect(projection.currentAgeYears).toBe(2);
    expect(projection.currentAgeLabel).toBe('Age 2');
    expect(projection.planted).toBe(true);
  });

  it('clamps the current age to the projection horizon', () => {
    const oldTree: Tree = { ...plantedTree, plantedAt: '1990-01-01T00:00:00Z' };
    const projection = buildTreeARProjection(oldTree, { nowMs: NOW });
    expect(projection.currentAgeYears).toBe(AR_PROJECTION_YEARS);
  });

  it('handles a tree that is not planted yet', () => {
    const funded: Tree = { ...plantedTree, status: 'funded', plantedAt: undefined };
    const projection = buildTreeARProjection(funded, { nowMs: NOW });

    expect(projection.planted).toBe(false);
    expect(projection.plantedAt).toBeNull();
    expect(projection.currentAgeYears).toBe(0);
    // The projection itself is still available — it is what the sponsor is buying.
    expect(projection.timeline).toHaveLength(AR_PROJECTION_YEARS + 1);
    expect(projection.matureHeightCm).toBeGreaterThan(0);
  });

  it('reports lifetime CO₂ in kilograms and tonnes', () => {
    const projection = buildTreeARProjection(plantedTree, { nowMs: NOW });

    expect(projection.lifetimeCo2Kg).toBe(projection.timeline[AR_PROJECTION_YEARS].cumulativeCo2Kg);
    expect(projection.lifetimeCo2Tonnes).toBeCloseTo(projection.lifetimeCo2Kg / 1000, 2);
    expect(projection.lifetimeCo2Kg).toBeGreaterThan(0);
  });

  it('is deterministic for a fixed clock', () => {
    const first = buildTreeARProjection(plantedTree, { nowMs: NOW });
    const second = buildTreeARProjection(plantedTree, { nowMs: NOW });
    expect(first).toEqual(second);
  });
});

describe('projection helpers', () => {
  it('clamps year lookup into the projection range', () => {
    const projection = buildTreeARProjection(plantedTree, { nowMs: NOW });

    expect(projectionYearAt(projection, -10).year).toBe(0);
    expect(projectionYearAt(projection, 999).year).toBe(AR_PROJECTION_YEARS);
    expect(projectionYearAt(projection, 7.4).year).toBe(7);
  });

  it('measures age in years and tolerates missing dates', () => {
    expect(ageInYears(null, NOW)).toBe(0);
    expect(ageInYears('not-a-date', NOW)).toBe(0);
    expect(ageInYears('2024-09-01T00:00:00Z', NOW)).toBeCloseTo(2, 1);
  });

  it('formats heights in centimetres and metres', () => {
    expect(formatHeight(0)).toBe('0 cm');
    expect(formatHeight(60)).toBe('60 cm');
    expect(formatHeight(2450)).toBe('24.5 m');
  });

  it('labels maturity as a percentage', () => {
    const projection = buildTreeARProjection(plantedTree, { nowMs: NOW });
    expect(maturityLabel(projection.timeline[0])).toBe('0% of maturity');
    expect(maturityLabel(projection.timeline[AR_PROJECTION_YEARS])).toBe('100% of maturity');
  });
});
