/**
 * Route tests for GET /api/challenges — Issue #1361
 */

import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/challenges', () => {
  it('returns the active challenge window', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.challenges).toHaveLength(1);
    expect(body.challenges[0].id).toBe('q3-2026-sustainability-sprint');
    expect(body.challenges[0].metric).toBe('offset_per_employee');
    expect(body.challenges[0].recognition).toBeTruthy();
    expect(new Date(body.challenges[0].endsAt).getTime()).toBeGreaterThan(
      new Date(body.challenges[0].startsAt).getTime()
    );
    expect(new Date(body.generatedAt).toISOString()).toBe(body.generatedAt);
  });
});
