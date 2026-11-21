import { describe, expect, it, beforeEach } from 'vitest';
import { buildPriceForecast } from '@/lib/forecasting/price-forecast';
import {
  createCommunityOffsetPool,
  contributeToCommunityOffsetPool,
  resetCommunityOffsetPools,
} from '@/lib/services/community-offset-pools';
import {
  recordMarketplacePurchase,
  processDueSettlements,
  resetSettlements,
} from '@/lib/settlement/settlement-service';
describe('issue 1375 price forecast', () => {
  it('returns the requested horizon and bounded confidence interval', () => {
    const result = buildPriceForecast({
      projectId: 'listing-1',
      currentPrice: 40,
      horizonMonths: 12,
      supplyGrowthPct: 2,
      demandGrowthPct: 8,
      policyIndex: 1,
      seasonalIndex: 0,
    });
    expect(result.points).toHaveLength(12);
    expect(result.points[0].lowerBound).toBeLessThan(result.points[0].predictedPrice);
    expect(result.points[11].upperBound).toBeGreaterThan(result.points[11].predictedPrice);
  });
});
describe('issue 1376 community offset pools', () => {
  beforeEach(resetCommunityOffsetPools);
  it('fills a pool and recomputes proportional shares', () => {
    const pool = createCommunityOffsetPool({
      name: 'Neighbourhood climate pool',
      creditListingId: 'listing-1',
      targetAmount: 100,
      wallet: 'GONE',
      contribution: 40,
    });
    const filled = contributeToCommunityOffsetPool(pool.id, 'GTWO', 60);
    expect(filled.status).toBe('funded');
    expect(filled.members.map((m) => m.sharePct)).toEqual([40, 60]);
  });
});
describe('issue 1377 settlement', () => {
  beforeEach(resetSettlements);
  it('is idempotent and pays due farmers', async () => {
    const one = recordMarketplacePurchase({
      purchaseId: 'purchase-1',
      farmerId: 'farmer-1',
      buyerId: 'buyer-1',
      grossAmount: 100,
      purchasedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(
      recordMarketplacePurchase({
        purchaseId: 'purchase-1',
        farmerId: 'farmer-1',
        buyerId: 'buyer-1',
        grossAmount: 100,
      })
    ).toBe(one);
    const paid = await processDueSettlements(new Date('2026-01-02T00:00:00.000Z'));
    expect(paid[0].status).toBe('paid');
    expect(paid[0].farmerAmount).toBe(95);
  });
});
