import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getFarmerPortfolio = vi.fn();

vi.mock('@/lib/api/farmer-portfolio', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/farmer-portfolio')>(
    '@/lib/api/farmer-portfolio'
  );
  return { ...actual, getFarmerPortfolio: (...args: unknown[]) => getFarmerPortfolio(...args) };
});

import { GET } from '../route';
import { FarmerNotFoundError } from '@/lib/api/farmer-portfolio';

const FARMER = `G${'A'.repeat(55)}`;

function call(address: string) {
  return GET(new NextRequest(`http://localhost/api/v2/farmers/${address}/portfolio`), {
    params: Promise.resolve({ farmerAddress: address }),
  });
}

describe('GET /api/v2/farmers/[farmerAddress]/portfolio', () => {
  beforeEach(() => {
    getFarmerPortfolio.mockReset();
  });

  it('400s on an invalid address', async () => {
    const res = await call('nope');
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid_address');
  });

  it('404s when the farmer is unknown', async () => {
    getFarmerPortfolio.mockImplementation(async () => {
      throw new FarmerNotFoundError(FARMER);
    });
    const res = await call(FARMER);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('not_found');
  });

  it('200s with the portfolio payload', async () => {
    getFarmerPortfolio.mockResolvedValue({ summary: { totalProjects: 1 } });
    const res = await call(FARMER);
    expect(res.status).toBe(200);
    expect((await res.json()).summary.totalProjects).toBe(1);
  });

  it('500s on unexpected errors', async () => {
    getFarmerPortfolio.mockImplementation(async () => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await call(FARMER)).status).toBe(500);
  });
});
