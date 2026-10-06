import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listMethodologies, getMethodologyBySlug } = vi.hoisted(() => ({
  listMethodologies: vi.fn(),
  getMethodologyBySlug: vi.fn(),
}));

vi.mock('@/backend/src/services/carbonMethodologies', async () => {
  const actual = await vi.importActual<typeof import('@/backend/src/services/carbonMethodologies')>(
    '@/backend/src/services/carbonMethodologies'
  );
  return { ...actual, listMethodologies, getMethodologyBySlug };
});
vi.mock('@/lib/db/client', () => ({ getPool: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET as list } from './route';
import { GET as getOne } from './[slug]/route';
import type { NextRequest } from 'next/server';

beforeEach(() => {
  listMethodologies.mockReset();
  getMethodologyBySlug.mockReset();
});

describe('GET /api/carbon/methodologies', () => {
  it('returns 200 with validated defaults', async () => {
    listMethodologies.mockResolvedValue({ methodologies: [], totalCount: 0, limit: 20, offset: 0 });
    const res = await list(new Request('http://x/api/carbon/methodologies?category=reforestation'));
    expect(res.status).toBe(200);
    expect(listMethodologies).toHaveBeenCalledWith({
      category: 'reforestation',
      limit: 20,
      offset: 0,
    });
  });

  it('returns 400 for an invalid category', async () => {
    const res = await list(new Request('http://x/api/carbon/methodologies?category=bogus'));
    expect(res.status).toBe(400);
    expect(listMethodologies).not.toHaveBeenCalled();
  });

  it('returns 500 without leaking details when the service throws', async () => {
    listMethodologies.mockRejectedValue(new Error('connection string secret'));
    const res = await list(new Request('http://x/api/carbon/methodologies'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});

describe('GET /api/carbon/methodologies/:slug', () => {
  const call = (slug: string) => getOne({} as NextRequest, { params: Promise.resolve({ slug }) });

  it('returns 400 for a malformed slug', async () => {
    expect((await call('Bad Slug!')).status).toBe(400);
  });
  it('returns 404 when missing', async () => {
    getMethodologyBySlug.mockResolvedValue(null);
    expect((await call('nope')).status).toBe(404);
  });
  it('returns 200 with the methodology', async () => {
    getMethodologyBySlug.mockResolvedValue({ slug: 'vm0047' });
    const res = await call('vm0047');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ methodology: { slug: 'vm0047' } });
  });
});
