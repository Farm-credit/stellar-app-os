import { describe, expect, it } from 'vitest';

import {
  MOCK_PLANTING_METHODS,
  getPlantingMethodMedia,
  getPlantingMethodsForProject,
  hasPlantingMethods,
  sumPlantingCoverage,
} from '../plantingMethods';

describe('getPlantingMethodsForProject', () => {
  it('returns methods for a documented project, coverage-descending', () => {
    const methods = getPlantingMethodsForProject('proj-001');
    expect(methods.length).toBeGreaterThanOrEqual(3);
    expect(methods.map((m) => m.kind)).toEqual([
      'containerised-nursery-stock',
      'seed-broadcasting',
      'assisted-natural-regeneration',
    ]);
    const coverages = methods.map((m) => m.coveragePercent);
    expect([...coverages].sort((a, b) => b - a)).toEqual(coverages);
  });

  it('returns an empty list for a project without documentation', () => {
    expect(getPlantingMethodsForProject('proj-999')).toEqual([]);
    expect(hasPlantingMethods('proj-999')).toBe(false);
  });
});

describe('planting method content', () => {
  it('every method links a scientific rationale source', () => {
    for (const method of MOCK_PLANTING_METHODS) {
      expect(method.rationaleUrl).toMatch(/^https?:\/\//);
      expect(method.rationaleSummary.length).toBeGreaterThan(20);
    }
  });

  it('every method documents at least one photo or video', () => {
    for (const method of MOCK_PLANTING_METHODS) {
      expect(method.media.length).toBeGreaterThan(0);
      for (const item of method.media) {
        expect(['photo', 'video']).toContain(item.type);
        expect(item.url).toMatch(/^https?:\/\//);
      }
    }
  });

  it('proj-001 documents the three canonical methods', () => {
    const kinds = getPlantingMethodsForProject('proj-001').map((m) => m.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'seed-broadcasting',
        'containerised-nursery-stock',
        'assisted-natural-regeneration',
      ])
    );
  });
});

describe('helpers', () => {
  it('sumPlantingCoverage adds coverage percentages', () => {
    expect(sumPlantingCoverage(getPlantingMethodsForProject('proj-001'))).toBe(100);
  });

  it('getPlantingMethodMedia lists photos before videos', () => {
    const media = getPlantingMethodMedia(getPlantingMethodsForProject('proj-001'));
    const firstVideo = media.findIndex((m) => m.type === 'video');
    const lastPhoto = media.map((m) => m.type).lastIndexOf('photo');
    if (firstVideo !== -1) {
      expect(lastPhoto).toBeLessThan(firstVideo);
    }
  });
});
