/**
 * Route tests for GET /api/v2/marketplace/trace/:id — Issue #1420
 */

import { describe, expect, it } from 'vitest';
import { GET } from './route';

function get(id: string) {
  return GET(new Request(`http://localhost:3000/api/v2/marketplace/trace/${id}`), {
    params: Promise.resolve({ id }),
  });
}

describe('GET /api/v2/marketplace/trace/:id', () => {
  it('returns the trace, verification and summary for a listing', async () => {
    const response = await get('listing-001');
    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Version')).toBe('v2');

    const body = await response.json();
    expect(body.trace.farm.name).toBe('Sítio Esperança');
    expect(body.trace.photos.length).toBeGreaterThan(0);
    expect(body.verification.verified).toBe(true);
    expect(body.summary.onChainEvents).toBeGreaterThan(0);
  });

  it('redacts farmers who have not consented to sharing', async () => {
    const body = await (await get('listing-003')).json();
    expect(body.trace.farmer.name).toBe('Farmer B. S.');
    expect(body.trace.farmer.photoUrl).toBeUndefined();
  });

  it('accepts batch ids', async () => {
    const response = await get('batch-ke-2022-031');
    expect(response.status).toBe(200);
  });

  it('returns 404 for credits without a farm origin', async () => {
    const response = await get('listing-002');
    expect(response.status).toBe(404);
  });
});
