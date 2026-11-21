/**
 * Route tests for GET /api/leaderboard/sponsors — Issue #1100
 */

import { describe, expect, it } from 'vitest';
import { GET } from './route';

const URL_BASE = 'http://localhost:3000/api/leaderboard/sponsors';

describe('GET /api/leaderboard/sponsors', () => {
  it('returns a global snapshot by default', async () => {
    const response = await GET(new Request(URL_BASE));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.query.scope).toBe('global');
    expect(body.rankings.length).toBeGreaterThan(0);
    expect(body.rankings[0].rank).toBe(1);
    expect(body.totals.trees).toBeGreaterThan(0);
  });

  it('scopes rankings to a region', async () => {
    const response = await GET(new Request(`${URL_BASE}?scope=region&region=Africa&limit=5`));
    const body = await response.json();
    expect(body.rankings.length).toBeLessThanOrEqual(5);
    expect(body.rankings.every((r: { region: string }) => r.region === 'Africa')).toBe(true);
  });

  it('scopes rankings to a tree type', async () => {
    const response = await GET(new Request(`${URL_BASE}?scope=tree-type&treeType=Mangrove`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.recent.every((e: { treeType: string }) => e.treeType === 'Mangrove')).toBe(true);
  });

  it('rejects invalid queries', async () => {
    const response = await GET(new Request(`${URL_BASE}?scope=region`));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.details).toContain('region is required when scope=region');
  });
});
