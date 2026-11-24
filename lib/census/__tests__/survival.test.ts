import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetCensusStore, submitCensusData } from '../service';
import {
  SURVIVAL_METHODOLOGY,
  getProjectSurvivalStatistic,
  getSpeciesSurvivalStatistic,
} from '../survival';
import type { TreeCensusRow } from '../types';

function rows(
  prefix: string,
  count: number,
  aliveCount: number,
  species = 'Teak'
): TreeCensusRow[] {
  return Array.from({ length: count }, (_, i) => ({
    treeId: `${prefix}-${i + 1}`,
    species,
    status: i < aliveCount ? ('alive' as const) : ('dead' as const),
    heightCm: 140,
    healthScore: i < aliveCount ? 85 : 0,
  }));
}

describe('Survival rate statistics (Issue #1645)', () => {
  beforeEach(() => {
    resetCensusStore();
  });

  afterEach(() => {
    resetCensusStore();
  });

  describe('project scope', () => {
    it('returns a labelled baseline estimate when no census exists', () => {
      const stat = getProjectSurvivalStatistic('proj-never-censused');
      expect(stat.source).toBe('baseline');
      expect(stat.treesCounted).toBeNull();
      expect(stat.historical).toEqual([]);
      expect(stat.survivalRate).toBeGreaterThanOrEqual(0);
      expect(stat.survivalRate).toBeLessThanOrEqual(100);
    });

    it('switches to census data after a field census is submitted', async () => {
      await submitCensusData({
        projectId: 'proj-surf-1',
        projectName: 'Project Surf',
        censusYear: 2026,
        surveyorName: 'Field Team A',
        surveyorAgentId: 'FLD-1',
        records: rows('T', 4, 3),
      });

      const stat = getProjectSurvivalStatistic('proj-surf-1');
      expect(stat.source).toBe('census');
      expect(stat.survivalRate).toBe(75);
      expect(stat.treesCounted).toBe(4);
      expect(stat.censusYear).toBe(2026);
      expect(stat.historical).toHaveLength(1);
      expect(stat.historical[0]).toMatchObject({ year: 2026, survivalRate: 75 });
    });

    it('accumulates annual census history across years', async () => {
      await submitCensusData({
        projectId: 'proj-annual',
        projectName: 'Annual Project',
        censusYear: 2025,
        surveyorName: 'Field Team A',
        surveyorAgentId: 'FLD-1',
        records: rows('T', 10, 8),
      });
      await submitCensusData({
        projectId: 'proj-annual',
        projectName: 'Annual Project',
        censusYear: 2026,
        surveyorName: 'Field Team A',
        surveyorAgentId: 'FLD-1',
        records: rows('T', 10, 9),
      });

      const stat = getProjectSurvivalStatistic('proj-annual');
      expect(stat.survivalRate).toBe(90);
      expect(stat.censusYear).toBe(2026);
      expect(stat.historical.map((p) => p.year)).toEqual([2025, 2026]);
      expect(stat.historical.map((p) => p.survivalRate)).toEqual([80, 90]);
    });
  });

  describe('species scope', () => {
    it('aggregates census records for the species across projects', async () => {
      await submitCensusData({
        projectId: 'proj-a',
        projectName: 'Project A',
        censusYear: 2026,
        surveyorName: 'Field Team A',
        surveyorAgentId: 'FLD-1',
        records: rows('A', 10, 8, 'Teak'),
      });
      await submitCensusData({
        projectId: 'proj-b',
        projectName: 'Project B',
        censusYear: 2026,
        surveyorName: 'Field Team B',
        surveyorAgentId: 'FLD-2',
        records: rows('B', 5, 5, 'Teak'),
      });
      // Different species must not affect the Teak figure.
      await submitCensusData({
        projectId: 'proj-a',
        projectName: 'Project A',
        censusYear: 2026,
        surveyorName: 'Field Team A',
        surveyorAgentId: 'FLD-1',
        records: rows('M', 4, 1, 'Moringa'),
      });

      const stat = getSpeciesSurvivalStatistic({ slug: 'teak', name: 'Teak' });
      expect(stat.source).toBe('census');
      expect(stat.treesCounted).toBe(15);
      // (8 + 5) / 15 = 86.7%
      expect(stat.survivalRate).toBe(86.7);
      expect(stat.historical).toHaveLength(1);
    });

    it('matches species labels case-insensitively', async () => {
      await submitCensusData({
        projectId: 'proj-c',
        projectName: 'Project C',
        censusYear: 2026,
        surveyorName: 'Field Team C',
        surveyorAgentId: 'FLD-3',
        records: rows('C', 2, 1, 'mOrInGa'),
      });

      const stat = getSpeciesSurvivalStatistic({ slug: 'moringa', name: 'Moringa' });
      expect(stat.source).toBe('census');
      expect(stat.survivalRate).toBe(50);
      expect(stat.treesCounted).toBe(2);
    });

    it('returns a stable baseline estimate while no census records the species', () => {
      const first = getSpeciesSurvivalStatistic({ slug: 'baobab', name: 'Baobab' });
      const second = getSpeciesSurvivalStatistic({ slug: 'baobab', name: 'Baobab' });

      expect(first.source).toBe('baseline');
      expect(first.treesCounted).toBeNull();
      expect(first.historical).toEqual([]);
      expect(first.survivalRate).toBeGreaterThanOrEqual(70);
      expect(first.survivalRate).toBeLessThanOrEqual(96);
      expect(second.survivalRate).toBe(first.survivalRate);
    });
  });

  it('exposes a methodology explanation covering cadence and formula', () => {
    expect(SURVIVAL_METHODOLOGY).toMatch(/alive/);
    expect(SURVIVAL_METHODOLOGY).toMatch(/census/i);
    expect(SURVIVAL_METHODOLOGY).toMatch(/at least once per year|annual/i);
  });
});
