import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { resetCensusStore, submitCensusData } from '@/lib/census/service';
import { GET } from './route';

describe('GET /api/census/survival (Issue #1645)', () => {
  beforeEach(() => {
    resetCensusStore();
  });

  it('returns project survival statistics', async () => {
    await submitCensusData({
      projectId: 'proj-api-1',
      projectName: 'API Project',
      censusYear: 2026,
      surveyorName: 'Field Team',
      surveyorAgentId: 'FLD-9',
      records: [
        { treeId: 'T-1', species: 'Teak', status: 'alive', heightCm: 150, healthScore: 90 },
        { treeId: 'T-2', species: 'Teak', status: 'dead', heightCm: 60, healthScore: 0 },
        { treeId: 'T-3', species: 'Teak', status: 'alive', heightCm: 160, healthScore: 88 },
        { treeId: 'T-4', species: 'Teak', status: 'alive', heightCm: 155, healthScore: 92 },
      ],
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/census/survival?projectId=proj-api-1')
    );
    expect(res.status).toBe(200);

    const data = (await res.json()) as { statistic: { survivalRate: number; source: string } };
    expect(data.statistic.survivalRate).toBe(75);
    expect(data.statistic.source).toBe('census');
  });

  it('returns species survival statistics', async () => {
    await submitCensusData({
      projectId: 'proj-api-2',
      projectName: 'API Project 2',
      censusYear: 2026,
      surveyorName: 'Field Team',
      surveyorAgentId: 'FLD-9',
      records: [
        { treeId: 'M-1', species: 'Moringa', status: 'alive', heightCm: 120, healthScore: 80 },
        { treeId: 'M-2', species: 'Moringa', status: 'dead', heightCm: 40, healthScore: 0 },
      ],
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/census/survival?species=moringa&name=Moringa')
    );
    const data = (await res.json()) as { statistic: { survivalRate: number; source: string } };
    expect(data.statistic.survivalRate).toBe(50);
    expect(data.statistic.source).toBe('census');
  });

  it('returns a labelled baseline for a species without census data', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/census/survival?species=baobab&name=Baobab')
    );
    const data = (await res.json()) as {
      statistic: { source: string; treesCounted: number | null };
    };
    expect(data.statistic.source).toBe('baseline');
    expect(data.statistic.treesCounted).toBeNull();
  });

  it('rejects requests without a scope', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/api/census/survival'));
    expect(res.status).toBe(400);
  });
});
