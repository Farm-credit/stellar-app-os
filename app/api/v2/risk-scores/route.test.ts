/**
 * Route tests for GET/POST /api/v2/risk-scores — Issue #1418
 */

import { describe, expect, it } from 'vitest';
import { GET, POST } from './route';
import { findSampleProjectRiskInput } from '@/backend/src/services/projectRiskScoring';

const URL_BASE = 'http://localhost:3000/api/v2/risk-scores';

function postRequest(body: unknown, raw = false): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe('GET /api/v2/risk-scores', () => {
  it('returns every project ranked lowest risk first', async () => {
    const response = await GET(new Request(URL_BASE));
    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v2');

    const { projects } = await response.json();
    expect(projects.length).toBeGreaterThan(1);
    for (let i = 1; i < projects.length; i++) {
      expect(projects[i].riskScore).toBeGreaterThanOrEqual(projects[i - 1].riskScore);
    }
  });

  it('filters by rating', async () => {
    const response = await GET(new Request(`${URL_BASE}?rating=High`));
    const { projects } = await response.json();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((p: { rating: string }) => p.rating === 'High')).toBe(true);
  });

  it('rejects an unknown rating', async () => {
    const response = await GET(new Request(`${URL_BASE}?rating=Extreme`));
    expect(response.status).toBe(400);
  });

  it('returns a single project score', async () => {
    const response = await GET(new Request(`${URL_BASE}?projectId=proj-001`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBe('proj-001');
    expect(body.pillars).toHaveLength(4);
  });

  it('returns 404 for an unknown project', async () => {
    const response = await GET(new Request(`${URL_BASE}?projectId=nope`));
    expect(response.status).toBe(404);
  });
});

describe('POST /api/v2/risk-scores', () => {
  it('scores caller-supplied inputs', async () => {
    const input = { ...findSampleProjectRiskInput('proj-002')!, projectId: 'custom-1' };
    const response = await POST(postRequest(input));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectId).toBe('custom-1');
    expect(['Low', 'Medium', 'High']).toContain(body.rating);
  });

  it('rejects invalid JSON', async () => {
    const response = await POST(postRequest('{not json', true));
    expect(response.status).toBe(400);
  });

  it('reports every validation failure', async () => {
    const input = structuredClone(findSampleProjectRiskInput('proj-001')!);
    input.verifier.reversalRate = 2;
    input.region.politicalStability = 9;
    const response = await POST(postRequest(input));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.details.join('\n')).toMatch(/verifier\.reversalRate/);
    expect(body.details.join('\n')).toMatch(/region\.politicalStability/);
  });
});
