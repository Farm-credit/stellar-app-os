import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/webhook/offset-verification-bridge', () => ({
  notifyPriceChanged: vi.fn(() => Promise.resolve([])),
}));

import { TickerService } from '@/lib/ticker/tickerService';
import { notifyPriceChanged } from '@/lib/webhook/offset-verification-bridge';

describe('TickerService price.changed exclusion (R1)', () => {
  it('never emits price.changed webhooks on trade fills or ticker updates', () => {
    const spy = vi.mocked(notifyPriceChanged);
    const service = new TickerService();

    const trade = service.recordTrade({
      listingId: 'listing-1',
      projectId: 'PROJ-001',
      projectName: 'Amazon Reforestation',
      buyerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      sellerAddress: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      quantityTons: 10,
      pricePerTon: 45,
      side: 'buy',
      status: 'filled',
    });

    service.updateTradeStatus(trade.id, 'filled');
    service.getMarketTicker();

    expect(spy).not.toHaveBeenCalled();
  });
});
