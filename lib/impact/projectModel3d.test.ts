import { describe, expect, it } from 'vitest';
import {
  buildForestLayout,
  growthAt,
  presetForType,
  seedFrom,
  simulateProject,
  SOIL_LAYERS,
} from '@/lib/impact/projectModel3d';

describe('growthAt', () => {
  it('starts at zero, reaches ~90% at maturity and never exceeds 1', () => {
    expect(growthAt(0, 20)).toBe(0);
    expect(growthAt(20, 20)).toBeCloseTo((1 - Math.exp(-3)) ** 2, 10);
    expect(growthAt(200, 20)).toBeLessThanOrEqual(1);
  });

  it('is monotonically increasing', () => {
    let previous = -1;
    for (let year = 0; year <= 40; year += 1) {
      const growth = growthAt(year, 15);
      expect(growth).toBeGreaterThan(previous);
      previous = growth;
    }
  });

  it('treats invalid input as year zero', () => {
    expect(growthAt(Number.NaN, 10)).toBe(0);
    expect(growthAt(-5, 10)).toBe(0);
  });
});

describe('simulateProject — forest growth', () => {
  const reforestation = simulateProject(presetForType('Reforestation'), 30);

  it('returns one snapshot per year including year 0', () => {
    expect(reforestation).toHaveLength(31);
    expect(reforestation.map((snapshot) => snapshot.year)).toEqual([...Array(31).keys()]);
  });

  it('starts bare and grows canopy and biomass over time', () => {
    expect(reforestation[0].canopyHeightM).toBe(0);
    expect(reforestation[0].biomassCo2T).toBe(0);
    expect(reforestation[30].canopyHeightM).toBeGreaterThan(reforestation[10].canopyHeightM);
    expect(reforestation[30].canopyHeightM).toBeLessThanOrEqual(25);
  });

  it('loses trees during establishment, then stabilises at the survival rate', () => {
    const planted = 250 * 1_100;
    expect(reforestation[0].livingTrees).toBe(planted);
    expect(reforestation[1].livingTrees).toBeLessThan(planted);
    expect(reforestation[3].livingTrees).toBe(Math.round(planted * 0.85));
    expect(reforestation[20].livingTrees).toBe(reforestation[3].livingTrees);
  });
});

describe('simulateProject — soil sequestration depth', () => {
  const mangrove = simulateProject(presetForType('Mangrove Restoration'), 30);

  it('accrues soil carbon linearly with area and time', () => {
    expect(mangrove[10].soilCo2T).toBeCloseTo(2.5 * 120 * 10, 6);
  });

  it('keeps layer shares summing to 1 and carbon summing to the soil total', () => {
    for (const snapshot of mangrove.slice(1)) {
      const share = snapshot.soilLayers.reduce((sum, layer) => sum + layer.share, 0);
      const carbon = snapshot.soilLayers.reduce((sum, layer) => sum + layer.carbonT, 0);
      expect(share).toBeCloseTo(1, 10);
      expect(carbon).toBeCloseTo(snapshot.soilCo2T, 6);
    }
    expect(mangrove[5].soilLayers.map((layer) => layer.id)).toEqual(
      SOIL_LAYERS.map((layer) => layer.id)
    );
  });

  it('moves stored carbon deeper as the root front advances', () => {
    const deepShare = (year: number) => mangrove[year].soilLayers[2].share;
    expect(mangrove[1].rootDepthCm).toBeLessThan(60);
    expect(deepShare(1)).toBe(0);
    expect(deepShare(25)).toBeGreaterThan(deepShare(8));
    expect(mangrove[30].rootDepthCm).toBeLessThanOrEqual(100);
  });

  it('never stores carbon below the preset root depth', () => {
    const agriculture = simulateProject(presetForType('Sustainable Agriculture'), 40);
    expect(agriculture.every((snapshot) => snapshot.soilLayers[2].carbonT === 0)).toBe(true);
  });
});

describe('simulateProject — emissions reduction rate', () => {
  it('equals the year-on-year stock gain for nature-based projects', () => {
    const snapshots = simulateProject(presetForType('Reforestation'), 10);
    const stock = (index: number) => snapshots[index].biomassCo2T + snapshots[index].soilCo2T;
    expect(snapshots[0].reductionRateT).toBe(0);
    expect(snapshots[5].reductionRateT).toBeCloseTo(stock(5) - stock(4), 6);
    expect(snapshots[10].cumulativeReductionT).toBeCloseTo(stock(10), 6);
  });

  it('ramps avoided emissions up over commissioning for renewable energy', () => {
    const energy = simulateProject(presetForType('Renewable Energy'), 5);
    expect(energy.map((snapshot) => snapshot.reductionRateT)).toEqual([
      0, 12_500, 25_000, 25_000, 25_000, 25_000,
    ]);
    expect(energy[5].livingTrees).toBe(0);
    expect(energy[5].cumulativeReductionT).toBe(112_500);
  });

  it('handles an empty horizon', () => {
    expect(simulateProject(presetForType('Other'), -3)).toHaveLength(1);
  });
});

describe('buildForestLayout', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    expect(buildForestLayout(20, 42)).toEqual(buildForestLayout(20, 42));
    expect(buildForestLayout(20, 42)).not.toEqual(buildForestLayout(20, 43));
  });

  it('keeps every tree on the ground plane with bounded variation', () => {
    const trees = buildForestLayout(64, seedFrom('proj-001'));
    expect(trees).toHaveLength(64);
    for (const tree of trees) {
      expect(Math.abs(tree.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(tree.y)).toBeLessThanOrEqual(1);
      expect(tree.scale).toBeGreaterThanOrEqual(0.75);
      expect(tree.scale).toBeLessThanOrEqual(1.25);
      expect(tree.mortalityRank).toBeGreaterThanOrEqual(0);
      expect(tree.mortalityRank).toBeLessThan(1);
    }
  });

  it('returns no trees for a non-positive count', () => {
    expect(buildForestLayout(0, 1)).toEqual([]);
  });
});
