import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as submitPost } from './submit/route';
import { GET as statsGet } from './stats/route';
import { resetCensusStore } from '@/lib/census/service';

describe('Tree Census API Routes (Issue #1695)', () => {
  beforeEach(() => {
    resetCensusStore();
  });

  describe('POST /api/v1/census/submit', () => {
    it('accepts JSON payload with records array and recalculates survival rates', async () => {
      const payload = {
        projectId: 'proj-kenya-01',
        projectName: 'Great Green Wall - Sector 4',
        censusYear: 2026,
        surveyorName: 'Faith Wanjiku',
        surveyorAgentId: 'FLD-77',
        records: [
          { treeId: 'GGW-001', species: 'Acacia', status: 'alive', heightCm: 160, healthScore: 85 },
          { treeId: 'GGW-002', species: 'Acacia', status: 'alive', heightCm: 140, healthScore: 90 },
          { treeId: 'GGW-003', species: 'Baobab', status: 'dead', heightCm: 80, healthScore: 0 },
        ],
      };

      const req = new NextRequest('http://localhost:3000/api/v1/census/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await submitPost(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.submission.totalTreesCounted).toBe(3);
      expect(data.submission.aliveCount).toBe(2);
      expect(data.submission.deadCount).toBe(1);
      // 2 / 3 * 100 = 66.7%
      expect(data.submission.survivalRate).toBe(66.7);
    });

    it('accepts JSON payload with embedded CSV string', async () => {
      const csv = `tree_id,species,status,height_cm,health_score
T-01,Teak,alive,150,85
T-02,Teak,alive,180,95`;

      const req = new NextRequest('http://localhost:3000/api/v1/census/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'proj-csv-json',
          projectName: 'CSV Embed Test',
          censusYear: 2026,
          csv,
        }),
      });

      const res = await submitPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.submission.totalTreesCounted).toBe(2);
      expect(data.submission.survivalRate).toBe(100);
    });

    it('accepts raw text/csv payload', async () => {
      const csv = `tree_id,species,status,height_cm,health_score
T-RAW-1,Moringa,alive,110,80
T-RAW-2,Moringa,dead,40,0`;

      const req = new NextRequest('http://localhost:3000/api/v1/census/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csv,
      });

      const res = await submitPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.submission.totalTreesCounted).toBe(2);
      expect(data.submission.survivalRate).toBe(50);
    });

    it('returns 400 when CSV is invalid or has no data rows', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/census/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: 'invalid,header,only\n',
      });

      const res = await submitPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it('returns 400 when submission has empty records', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/census/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [] }),
      });

      const res = await submitPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Missing census records/i);
    });
  });

  describe('GET /api/v1/census/stats', () => {
    it('retrieves project census statistics and historical submissions', async () => {
      // First submit a census
      const submitReq = new NextRequest('http://localhost:3000/api/v1/census/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'proj-stats-test',
          projectName: 'Stats Verification Project',
          censusYear: 2026,
          records: [
            { treeId: 'STAT-1', species: 'Neem', status: 'alive', heightCm: 150, healthScore: 90 },
            { treeId: 'STAT-2', species: 'Neem', status: 'alive', heightCm: 170, healthScore: 80 },
          ],
        }),
      });
      await submitPost(submitReq);

      const statsReq = new NextRequest('http://localhost:3000/api/v1/census/stats?projectId=proj-stats-test');
      const statsRes = await statsGet(statsReq);
      expect(statsRes.status).toBe(200);

      const data = await statsRes.json();
      expect(data.stats.projectId).toBe('proj-stats-test');
      expect(data.stats.currentSurvivalRate).toBe(100);
      expect(data.stats.totalCensusSubmissions).toBe(1);
      expect(data.submissions).toHaveLength(1);
      expect(data.submissions[0].survivalRate).toBe(100);
    });
  });
});
