import { describe, expect, it } from 'vitest';
import {
  DEFAULT_Z_THRESHOLD,
  SEVERITY_THRESHOLDS,
  describeFakeFarmer,
  scoreDoubleSelling,
  scoreFakeFarmer,
  scoreMetricManipulation,
  scoreProjectInflation,
  severityFor,
  zScore,
  type PlanterSignals,
  type SpeciesNorm,
  type TreeSignals,
} from '../fraud';

function makeTree(overrides: Partial<TreeSignals> = {}): TreeSignals {
  return {
    treeId: 1,
    planterId: 10,
    distinctFunders: 1,
    escrowReleases: 1,
    retirements: 1,
    distinctPhotoHashes: 3,
    photoSubmissions: 3,
    statusChanges: 2,
    survivalPct: 90,
    ...overrides,
  };
}

function makePlanter(overrides: Partial<PlanterSignals> = {}): PlanterSignals {
  return {
    planterId: 1,
    stellarAddress: 'GABC…',
    kycStatus: 'verified',
    distinctIdentityHashes: 1,
    identityHashSharers: 0,
    treesPlanted: 5,
    treesWithPhotos: 5,
    recentSurvivalChecks: 3,
    distinctGpsClusters: 3,
    creditsSold30d: 1,
    fleetCreditsSold30d: [1, 2, 1, 0, 3, 2],
    fleetTreesPlanted: [5, 4, 6, 3, 7, 5],
    fleetSurvivalChecks: [3, 2, 4, 1, 5, 3],
    ...overrides,
  };
}

function makeNorm(overrides: Partial<SpeciesNorm> = {}): SpeciesNorm {
  return {
    speciesSlug: 'teak',
    region: 's1',
    meanCo2KgPerYear: 22,
    stddevCo2KgPerYear: 4,
    ...overrides,
  };
}

describe('severityFor', () => {
  it('maps scores to the documented severity bands', () => {
    expect(severityFor(0)).toBe('low');
    expect(severityFor(SEVERITY_THRESHOLDS.medium)).toBe('medium');
    expect(severityFor(SEVERITY_THRESHOLDS.high)).toBe('high');
    expect(severityFor(SEVERITY_THRESHOLDS.critical)).toBe('critical');
    expect(severityFor(100)).toBe('critical');
  });
});

describe('scoreDoubleSelling', () => {
  it('scores a clean single-funder tree at 0', () => {
    expect(scoreDoubleSelling(makeTree())).toBe(0);
  });

  it('flags multiple distinct funders on one tree', () => {
    const score = scoreDoubleSelling(makeTree({ distinctFunders: 2 }));
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it('escalates with each extra funder', () => {
    const two = scoreDoubleSelling(makeTree({ distinctFunders: 2 }));
    const four = scoreDoubleSelling(makeTree({ distinctFunders: 4 }));
    expect(four).toBeGreaterThan(two);
  });

  it('caps funder score at 60', () => {
    expect(scoreDoubleSelling(makeTree({ distinctFunders: 99 }))).toBe(60);
  });

  it('flags more than two escrow releases', () => {
    expect(scoreDoubleSelling(makeTree({ escrowReleases: 3 }))).toBe(25);
  });

  it('flags multiple retirements of the same credits', () => {
    expect(scoreDoubleSelling(makeTree({ retirements: 2 }))).toBe(40);
  });

  it('accumulates and caps at 100', () => {
    const score = scoreDoubleSelling(
      makeTree({ distinctFunders: 3, escrowReleases: 5, retirements: 3 })
    );
    expect(score).toBe(100);
  });
});

describe('scoreFakeFarmer', () => {
  it('scores a clean verified planter at 0', () => {
    expect(scoreFakeFarmer(makePlanter())).toBe(0);
  });

  it('flags unverified KYC with active credit sales', () => {
    const score = scoreFakeFarmer(makePlanter({ kycStatus: 'pending' }));
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it('flags shared identity hashes (sybil farm)', () => {
    const one = scoreFakeFarmer(makePlanter({ identityHashSharers: 1 }));
    const three = scoreFakeFarmer(makePlanter({ identityHashSharers: 3 }));
    expect(one).toBeGreaterThanOrEqual(20);
    expect(three).toBeGreaterThan(one);
  });

  it('flags many trees on a single GPS cluster', () => {
    const score = scoreFakeFarmer(makePlanter({ treesPlanted: 50, distinctGpsClusters: 1 }));
    expect(score).toBeGreaterThanOrEqual(30);
  });

  it('flags planters with zero photo evidence', () => {
    const score = scoreFakeFarmer(makePlanter({ treesWithPhotos: 0 }));
    expect(score).toBeGreaterThanOrEqual(25);
  });

  it('flags survival-check bursts above the z threshold', () => {
    const planter = makePlanter({
      recentSurvivalChecks: 40,
      fleetSurvivalChecks: [2, 3, 2, 4, 3, 2, 3],
    });
    const z = zScore(planter.recentSurvivalChecks, planter.fleetSurvivalChecks);
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(DEFAULT_Z_THRESHOLD);
    expect(scoreFakeFarmer(planter)).toBeGreaterThanOrEqual(20);
  });

  it('accumulates multiple signals and caps at 100', () => {
    const score = scoreFakeFarmer(
      makePlanter({
        kycStatus: 'suspended',
        identityHashSharers: 5,
        treesPlanted: 100,
        distinctGpsClusters: 1,
        treesWithPhotos: 0,
      })
    );
    expect(score).toBe(100);
  });
});

describe('scoreProjectInflation', () => {
  it('scores claims within the norm at 0', () => {
    expect(scoreProjectInflation(22, makeNorm())).toBe(0);
    expect(scoreProjectInflation(10, makeNorm())).toBe(0);
  });

  it('scores claims just above threshold at the base level', () => {
    // z = (30 - 22) / max(4, 2.2, 1) = 2.0 → below 2.5 threshold
    expect(scoreProjectInflation(30, makeNorm())).toBe(0);
    // z = (32 - 22) / 4 = 2.5 → exactly the threshold
    expect(scoreProjectInflation(32, makeNorm())).toBe(50);
  });

  it('scales with sigma distance above the threshold', () => {
    const z4 = scoreProjectInflation(38, makeNorm()); // z = 4
    const z6 = scoreProjectInflation(46, makeNorm()); // z = 6
    expect(z4).toBeGreaterThan(50);
    expect(z6).toBeGreaterThan(z4);
    expect(z6).toBeLessThanOrEqual(100);
  });

  it('uses a stddev floor so small populations do not explode the z-score', () => {
    const tinyStddev = makeNorm({ meanCo2KgPerYear: 5, stddevCo2KgPerYear: 0.01 });
    // z with floor = (100 - 5) / max(0.5, 1) = 95 → capped at 100
    expect(scoreProjectInflation(100, tinyStddev)).toBe(100);
  });
});

describe('scoreMetricManipulation', () => {
  it('scores a clean evidence history at 0', () => {
    expect(scoreMetricManipulation(makeTree())).toBe(0);
  });

  it('flags repeated identical photo hashes', () => {
    const score = scoreMetricManipulation(
      makeTree({ photoSubmissions: 5, distinctPhotoHashes: 1 })
    );
    expect(score).toBeGreaterThanOrEqual(45);
  });

  it('moderately flags photo inflation without exact reuse', () => {
    const score = scoreMetricManipulation(
      makeTree({ photoSubmissions: 7, distinctPhotoHashes: 3 })
    );
    expect(score).toBe(20);
  });

  it('flags impossible survival percentages', () => {
    const score = scoreMetricManipulation(makeTree({ survivalPct: 120 }));
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it('flags excessive status churn', () => {
    const score = scoreMetricManipulation(makeTree({ statusChanges: 6 }));
    expect(score).toBe(20);
  });

  it('accumulates multiple manipulations', () => {
    const score = scoreMetricManipulation(
      makeTree({ photoSubmissions: 6, distinctPhotoHashes: 1, statusChanges: 7, survivalPct: 150 })
    );
    expect(score).toBeGreaterThanOrEqual(100);
  });
});

describe('zScore', () => {
  it('returns null for tiny populations', () => {
    expect(zScore(5, [1, 2, 3])).toBeNull();
  });

  it('returns null when the population has zero variance', () => {
    expect(zScore(5, [2, 2, 2, 2, 2])).toBeNull();
  });

  it('computes positive and negative z-scores', () => {
    const population = [2, 4, 4, 4, 5, 5, 7, 9];
    // classic dataset: mean=5, stddev=2
    expect(zScore(9, population)).toBeCloseTo(2, 5);
    expect(zScore(1, population)).toBeCloseTo(-2, 5);
  });
});

describe('describeFakeFarmer', () => {
  it('lists all firing heuristics', () => {
    const planter = makePlanter({
      kycStatus: 'pending',
      identityHashSharers: 2,
      treesPlanted: 50,
      distinctGpsClusters: 1,
      treesWithPhotos: 0,
    });
    const text = describeFakeFarmer(planter);
    expect(text).toContain('kyc=pending');
    expect(text).toContain('identity hash shared with 2');
    expect(text).toContain('single GPS cluster');
    expect(text).toContain('no photo evidence');
  });

  it('falls back to a generic reason when only the score fired', () => {
    const text = describeFakeFarmer(makePlanter());
    expect(text).toBe('heuristic score threshold reached');
  });
});
