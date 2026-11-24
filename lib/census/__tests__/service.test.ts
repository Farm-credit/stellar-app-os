import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseCensusCsv,
  submitCensusData,
  getProjectCensusStats,
  listCensusSubmissions,
  resetCensusStore,
  MAX_CENSUS_BATCH_SIZE,
} from '../service';
import type { TreeCensusRow } from '../types';

describe('Tree Census Service (Issue #1695)', () => {
  beforeEach(() => {
    resetCensusStore();
  });

  describe('parseCensusCsv', () => {
    it('returns error when CSV content is empty or has only header', () => {
      const res = parseCensusCsv('tree_id,species,status\n');
      expect(res.valid).toBe(false);
      expect(res.totalParsed).toBe(0);
      expect(res.errors[0]?.message).toMatch(/header row and at least one data row/i);
    });

    it('returns error when tree_id column is missing', () => {
      const csv = 'species,status,height_cm\nTeak,alive,150';
      const res = parseCensusCsv(csv);
      expect(res.valid).toBe(false);
      expect(res.errors[0]?.field).toBe('tree_id');
    });

    it('successfully parses valid CSV rows with optional attributes', () => {
      const csv = `tree_id,species,status,height_cm,health_score,cause,notes
TR-001,Teak,alive,175.5,88,,Vigorous
TR-002,Moringa,dead,60,0,pest_damage,Pest attack
TR-003,Neem,alive,120,70,drought_stress,Dry leaves`;

      const res = parseCensusCsv(csv);
      expect(res.valid).toBe(true);
      expect(res.totalParsed).toBe(3);
      expect(res.previewRows).toHaveLength(3);

      expect(res.previewRows[0]).toEqual({
        treeId: 'TR-001',
        species: 'Teak',
        status: 'alive',
        heightCm: 175.5,
        healthScore: 88,
        cause: null,
        notes: 'Vigorous',
      });

      expect(res.previewRows[1]).toEqual({
        treeId: 'TR-002',
        species: 'Moringa',
        status: 'dead',
        heightCm: 60,
        healthScore: 0,
        cause: 'pest_damage',
        notes: 'Pest attack',
      });
    });

    it('enforces status of dead trees to have health score 0', () => {
      const csv = `tree_id,status,health_score\nTR-DEAD,dead,95`;
      const res = parseCensusCsv(csv);
      expect(res.valid).toBe(true);
      expect(res.previewRows[0].healthScore).toBe(0);
    });

    it('handles numeric status flags "0" and "false" as dead', () => {
      const csv = `tree_id,status\nTR-01,0\nTR-02,false`;
      const res = parseCensusCsv(csv);
      expect(res.valid).toBe(true);
      expect(res.previewRows[0].status).toBe('dead');
      expect(res.previewRows[1].status).toBe('dead');
    });

    it('rejects submissions exceeding the maximum batch limit of 10,000', () => {
      const lines = ['tree_id,species,status'];
      for (let i = 0; i <= MAX_CENSUS_BATCH_SIZE; i++) {
        lines.push(`TR-${i},Teak,alive`);
      }
      const res = parseCensusCsv(lines.join('\n'));
      expect(res.valid).toBe(false);
      expect(res.errors[0]?.field).toBe('batch_size');
      expect(res.errors[0]?.message).toMatch(/exceeds maximum allowed batch limit/i);
    });

    it('flags invalid numeric health scores or heights', () => {
      const csv = `tree_id,height_cm,health_score\nTR-ERR,-50,150`;
      const res = parseCensusCsv(csv);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'height_cm')).toBe(true);
      expect(res.errors.some((e) => e.field === 'health_score')).toBe(true);
    });
  });

  describe('submitCensusData', () => {
    it('throws error when records array is empty', async () => {
      await expect(
        submitCensusData({
          projectId: 'proj-001',
          projectName: 'Savanna Project',
          censusYear: 2026,
          surveyorName: 'Sarah Field',
          surveyorAgentId: 'AGT-01',
          records: [],
        })
      ).rejects.toThrow(/must include at least one tree record/i);
    });

    it('correctly calculates survival rate, height, and health metrics', async () => {
      const records: TreeCensusRow[] = [
        { treeId: 'T1', species: 'Teak', status: 'alive', heightCm: 150, healthScore: 90 },
        { treeId: 'T2', species: 'Teak', status: 'alive', heightCm: 170, healthScore: 80 },
        { treeId: 'T3', species: 'Moringa', status: 'alive', heightCm: 100, healthScore: 60 },
        { treeId: 'T4', species: 'Moringa', status: 'dead', heightCm: 50, healthScore: 0 },
      ];

      const submission = await submitCensusData({
        projectId: 'proj-test-1',
        projectName: 'Test Savannah Area',
        censusYear: 2026,
        surveyorName: 'John Doe',
        surveyorAgentId: 'JD-001',
        records,
      });

      expect(submission.totalTreesCounted).toBe(4);
      expect(submission.aliveCount).toBe(3);
      expect(submission.deadCount).toBe(1);
      // 3 / 4 * 100 = 75%
      expect(submission.survivalRate).toBe(75);
      // (150 + 170 + 100 + 50) / 4 = 117.5 cm
      expect(submission.averageHeightCm).toBe(117.5);
      // (90 + 80 + 60 + 0) / 4 = 57.5
      expect(submission.averageHealthScore).toBe(57.5);

      // Check distribution
      expect(submission.healthDistribution).toEqual({
        thriving: 2, // 90, 80
        moderate: 1, // 60
        critical: 0,
        dead: 1,     // 0
      });

      // Check species breakdown
      const teak = submission.speciesBreakdown.find((s) => s.species === 'Teak');
      expect(teak).toBeDefined();
      expect(teak?.total).toBe(2);
      expect(teak?.alive).toBe(2);
      expect(teak?.survivalRate).toBe(100);

      const moringa = submission.speciesBreakdown.find((s) => s.species === 'Moringa');
      expect(moringa).toBeDefined();
      expect(moringa?.total).toBe(2);
      expect(moringa?.alive).toBe(1);
      expect(moringa?.dead).toBe(1);
      expect(moringa?.survivalRate).toBe(50);
    });

    it('automatically updates platform project stats with the latest census data', async () => {
      const records: TreeCensusRow[] = [
        { treeId: 'T10', species: 'Acacia', status: 'alive', heightCm: 200, healthScore: 95 },
        { treeId: 'T11', species: 'Acacia', status: 'alive', heightCm: 220, healthScore: 85 },
      ];

      await submitCensusData({
        projectId: 'proj-acacia',
        projectName: 'Acacia Belt',
        censusYear: 2026,
        surveyorName: 'Field Leader',
        surveyorAgentId: 'FL-009',
        records,
      });

      const stats = getProjectCensusStats('proj-acacia');
      expect(stats.projectId).toBe('proj-acacia');
      expect(stats.projectName).toBe('Acacia Belt');
      expect(stats.latestCensusYear).toBe(2026);
      expect(stats.currentSurvivalRate).toBe(100);
      expect(stats.totalCensusSubmissions).toBe(1);
      expect(stats.historicalSurvivalRates).toHaveLength(1);
      expect(stats.historicalSurvivalRates[0].survivalRate).toBe(100);
      expect(stats.historicalSurvivalRates[0].totalTreesCounted).toBe(2);
    });

    it('records and lists submissions by project', async () => {
      const records: TreeCensusRow[] = [
        { treeId: 'T20', species: 'Neem', status: 'alive', heightCm: 140, healthScore: 80 },
      ];

      await submitCensusData({
        projectId: 'proj-A',
        projectName: 'Project A',
        censusYear: 2025,
        surveyorName: 'Agent A',
        surveyorAgentId: 'A-1',
        records,
      });

      await submitCensusData({
        projectId: 'proj-B',
        projectName: 'Project B',
        censusYear: 2026,
        surveyorName: 'Agent B',
        surveyorAgentId: 'B-1',
        records,
      });

      const all = listCensusSubmissions();
      expect(all.length).toBe(2);

      const filteredA = listCensusSubmissions('proj-A');
      expect(filteredA.length).toBe(1);
      expect(filteredA[0].projectId).toBe('proj-A');
    });
  });
});
