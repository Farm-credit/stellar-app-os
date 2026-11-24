import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

describe('GET /api/benefactors/leaderboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ranked benefactors and summary with HTTP 200', async () => {
    const req = new NextRequest('http://localhost:3000/api/benefactors/leaderboard');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries[0].rank).toBe(1);
    expect(body.summary.totalHectaresRestored).toBeGreaterThan(0);
    expect(body.meta.sortBy).toBe('hectares');
  });

  it('filters by type and applies limit parameter', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/benefactors/leaderboard?type=corporate&limit=2'
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries.every((e: { type: string }) => e.type === 'corporate')).toBe(true);
    expect(body.meta.type).toBe('corporate');
  });

  it('warns and falls back safely on invalid query parameters', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const req = new NextRequest(
      'http://localhost:3000/api/benefactors/leaderboard?type=invalid&period=weekly&limit=-3'
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.meta.type).toBe('all');
    expect(body.meta.period).toBe('all-time');
    expect(warnSpy).toHaveBeenCalled();
  });
});
