/**
 * GET /api/v2/projects/{id}/soil-health — Issue #1664
 */

import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

function request(projectId: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://localhost/api/v2/projects/${projectId}/soil-health`),
    { params: Promise.resolve({ id: projectId }) },
  ];
}

describe('GET /api/v2/projects/[id]/soil-health', () => {
  it('returns the ordered measurement series and comparison for a known project', async () => {
    const [req, ctx] = request('proj-001');
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('X-API-Version')).toBe('v2');
    expect(res.headers.get('Cache-Control')).toContain('max-age=300');

    expect(body.projectId).toBe('proj-001');
    expect(body.source).toBeTruthy();
    expect(body.isSampleData).toBe(true);
    expect(body.readings.length).toBeGreaterThanOrEqual(2);
    expect(body.hasHistory).toBe(true);

    const dates = body.readings.map((reading: { date: string }) => reading.date);
    expect([...dates].sort()).toEqual(dates);

    expect(body.comparison).toHaveLength(4);
    expect(body.comparison.map((row: { label: string }) => row.label)).toEqual([
      'pH',
      'Nitrogen',
      'Moisture',
      'Organic matter',
    ]);

    const ph = body.comparison.find((row: { key: string }) => row.key === 'ph');
    expect(ph.change).toBeGreaterThan(0);
    expect(ph.latestPercentOfScale).toBeGreaterThan(ph.baselinePercentOfScale);
  });

  it('returns 404 for a project without soil measurements', async () => {
    const [req, ctx] = request('proj-does-not-exist');
    const res = await GET(req, ctx);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ code: 'not_found' });
  });

  it('returns 400 for a blank project id', async () => {
    const req = new NextRequest('http://localhost/api/v2/projects//soil-health');
    const res = await GET(req, { params: Promise.resolve({ id: '  ' }) });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'invalid_project' });
  });
});
