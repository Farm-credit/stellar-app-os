import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type * as FarmerPortfolioModule from '@/lib/api/farmer-portfolio';

const getFarmerPortfolio = vi.fn();
vi.mock('@/lib/api/farmer-portfolio', async () => {
  const actual = await vi.importActual<typeof FarmerPortfolioModule>('@/lib/api/farmer-portfolio');
  return { ...actual, getFarmerPortfolio: (...args: unknown[]) => getFarmerPortfolio(...args) };
});

import { GET } from './route';
import { FarmerNotFoundError } from '@/lib/api/farmer-portfolio';

const FARMER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

function call(address: string) {
  return GET(new NextRequest(`http://localhost/api/farmers/${address}/portfolio`), {
    params: Promise.resolve({ farmerAddress: address }),
  });
}

describe('GET /api/farmers/[farmerAddress]/portfolio', () => {
  beforeEach(() => {
    getFarmerPortfolio.mockReset();
  });

  it('rejects an invalid Stellar address', async () => {
    const response = await call('nope');
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_address');
  });

  it('returns the farmer profile and portfolio summary', async () => {
    getFarmerPortfolio.mockResolvedValue({
      farmer: { address: FARMER, name: 'Amani Mwangi' },
      summary: { totalProjects: 2, totalAcres: 1_270, totalCreditsAvailable: 14_000 },
      projects: [],
      buyerReviews: [],
    });

    const response = await call(FARMER);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.farmer.address).toBe(FARMER);
    expect(body.summary.totalProjects).toBe(2);
    expect(getFarmerPortfolio).toHaveBeenCalledWith(FARMER);
  });

  it('returns not found when the farmer has no portfolio', async () => {
    getFarmerPortfolio.mockRejectedValue(new FarmerNotFoundError(FARMER));
    const response = await call(FARMER);
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('not_found');
  });
});
