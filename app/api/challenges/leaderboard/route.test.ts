/**
 * Route tests for GET /api/challenges/leaderboard — Issue #1361
 */

import { describe, expect, it } from 'vitest';
import { GET } from './route';

const URL_BASE = 'http://localhost:3000/api/challenges/leaderboard';

describe('GET /api/challenges/leaderboard', () => {
  it('returns standings with a recognised winner', async () => {
    const response = await GET(new Request(URL_BASE));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.metric).toBe('offset_per_employee');
    expect(body.entries[0].rank).toBe(1);
    expect(body.winner).not.toBeNull();
    expect(body.winner.teamId).toBe(body.entries[0].teamId);
    expect(body.winner.offsetPerEmployee).toBeGreaterThan(0);
    expect(body.totalTeams).toBeGreaterThan(0);
    expect(body.generatedAt).toBe(body.lastUpdated);
  });

  it('ranks ineligible teams with no employees last', async () => {
    const body = await (await GET(new Request(URL_BASE))).json();

    const firstIneligible = body.entries.findIndex(
      (entry: { isEligible: boolean }) => !entry.isEligible
    );
    const lastEligible = body.entries
      .map((entry: { isEligible: boolean }) => entry.isEligible)
      .lastIndexOf(true);

    expect(firstIneligible).toBeGreaterThan(-1);
    expect(firstIneligible).toBeGreaterThan(lastEligible);
    expect(
      body.entries
        .slice(firstIneligible)
        .every((entry: { offsetPerEmployee: number }) => entry.offsetPerEmployee === 0)
    ).toBe(true);
  });

  it('honours the limit', async () => {
    const body = await (await GET(new Request(`${URL_BASE}?limit=2`))).json();
    expect(body.entries).toHaveLength(2);
    expect(body.limit).toBe(2);
  });

  it('rejects an invalid limit', async () => {
    const response = await GET(new Request(`${URL_BASE}?limit=0`));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.details[0]).toContain('limit');
  });
});
