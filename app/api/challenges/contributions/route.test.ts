/**
 * Route tests for POST /api/challenges/contributions — Issue #1361
 */

import { describe, expect, it } from 'vitest';
import { POST } from './route';

const URL_BASE = 'http://localhost:3000/api/challenges/contributions';

function post(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/challenges/contributions', () => {
  it('credits a team and returns its refreshed standing', async () => {
    const response = await POST(post({ teamId: 'product', offsetTonnes: 12, trees: 48 }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.team.teamId).toBe('product');
    expect(body.team.totalOffsetTonnes).toBeGreaterThan(0);
    expect(body.standing.teamId).toBe('product');
    expect(body.standing.rank).toBeGreaterThanOrEqual(1);
    expect(body.generatedAt).toBeTypeOf('string');
  });

  it('rejects invalid payloads', async () => {
    expect((await POST(post({ offsetTonnes: 5 }))).status).toBe(400);
    expect((await POST(post({ teamId: 'product', offsetTonnes: -1 }))).status).toBe(400);
    expect((await POST(post({ teamId: 'product', offsetTonnes: 5, trees: -2 }))).status).toBe(400);
    expect((await POST(post('not-json'))).status).toBe(400);
  });

  it('returns 404 for an unknown team', async () => {
    const response = await POST(post({ teamId: 'does-not-exist', offsetTonnes: 5 }));
    expect(response.status).toBe(404);
  });
});
