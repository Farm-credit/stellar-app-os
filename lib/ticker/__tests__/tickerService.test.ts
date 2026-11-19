import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TickerService,
  resetTickerService,
  getTickerService,
  type TickerServiceEvent,
} from '@/lib/ticker/tickerService';
import type { CarbonCreditTradeFill } from '@/lib/types/ticker';

describe('lib/ticker/tickerService', () => {
  let service: TickerService;

  beforeEach(() => {
    resetTickerService();
    service = new TickerService({
      maxRecentTrades: 10,
      maxTradesPerListing: 5,
      statsWindowMs: 60 * 60 * 1000,
    });
  });

  describe('recordTrade', () => {
    it('records a buy trade with correct defaults', () => {
      const trade = service.recordTrade({
        listingId: 'listing-1',
        projectName: 'Amazon Reforestation',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Amazon, Brazil',
        buyerId: 'buyer-001',
        sellerId: 'seller-001',
        side: 'buy',
        quantity: 100,
        pricePerTon: 15.5,
      });

      expect(trade.id).toMatch(/^trade_[a-z0-9]+_[a-z0-9]+$/);
      expect(trade.listingId).toBe('listing-1');
      expect(trade.side).toBe('buy');
      expect(trade.quantity).toBe(100);
      expect(trade.pricePerTon).toBe(15.5);
      expect(trade.totalAmount).toBe(1550);
      expect(trade.currency).toBe('USD');
      expect(trade.status).toBe('filled');
      expect(trade.createdAt).toBeTruthy();
      expect(trade.filledAt).toBeTruthy();
      expect(trade.updatedAt).toBe(trade.createdAt);
    });

    it('records a sell trade with explicit totalAmount', () => {
      const trade = service.recordTrade({
        listingId: 'listing-2',
        projectName: 'Solar Farm',
        projectType: 'Renewable Energy',
        verificationStatus: 'Gold Standard',
        vintageYear: 2024,
        location: 'Sahara, Morocco',
        buyerId: 'buyer-002',
        sellerId: 'seller-002',
        side: 'sell',
        quantity: 50,
        pricePerTon: 20,
        totalAmount: 990,
        currency: 'EUR',
        status: 'partial',
        txHash: 'abc123def456',
      });

      expect(trade.side).toBe('sell');
      expect(trade.totalAmount).toBe(990);
      expect(trade.currency).toBe('EUR');
      expect(trade.status).toBe('partial');
      expect(trade.txHash).toBe('abc123def456');
    });

    it('emits trade:new event via event emitter', () => {
      const listener = vi.fn();
      service.on('event', listener);

      const trade = service.recordTrade({
        listingId: 'listing-1',
        projectName: 'Project',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 10,
      });

      const events = listener.mock.calls.map((c) => c[0] as TickerServiceEvent);
      const tradeNew = events.find((e) => e.type === 'trade:new');
      expect(tradeNew).toBeDefined();
      if (tradeNew?.type === 'trade:new') {
        expect(tradeNew.trade.id).toBe(trade.id);
      }
    });

    it('emits ticker:update event after recording', () => {
      const listener = vi.fn();
      service.on('event', listener);

      service.recordTrade({
        listingId: 'listing-1',
        projectName: 'Project',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 10,
      });

      const events = listener.mock.calls.map((c) => c[0] as TickerServiceEvent);
      expect(events.some((e) => e.type === 'ticker:update')).toBe(true);
    });
  });

  describe('updateTradeStatus', () => {
    it('updates trade status and txHash', () => {
      const trade = service.recordTrade({
        listingId: 'listing-1',
        projectName: 'Project',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 10,
        status: 'pending',
      });

      const originalUpdatedAt = trade.updatedAt;
      const result = service.updateTradeStatus(trade.id, 'filled', 'confirmed_hash_123');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('filled');
      expect(result?.txHash).toBe('confirmed_hash_123');
      expect(result?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('returns null for unknown trade id', () => {
      const result = service.updateTradeStatus('nonexistent', 'filled');
      expect(result).toBeNull();
    });

    it('emits trade:update event', () => {
      const trade = service.recordTrade({
        listingId: 'listing-1',
        projectName: 'Project',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 10,
        status: 'pending',
      });

      const listener = vi.fn();
      service.on('event', listener);

      service.updateTradeStatus(trade.id, 'filled');

      const events = listener.mock.calls.map((c) => c[0] as TickerServiceEvent);
      const tradeUpdate = events.find((e) => e.type === 'trade:update');
      expect(tradeUpdate?.type === 'trade:update' && tradeUpdate.trade.status).toBe('filled');
    });
  });

  describe('getTradeById', () => {
    it('returns trade by id', () => {
      const trade = service.recordTrade({
        listingId: 'listing-1',
        projectName: 'Project',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 10,
      });

      const found = service.getTradeById(trade.id);
      expect(found?.id).toBe(trade.id);
    });

    it('returns null for missing trade', () => {
      expect(service.getTradeById('missing')).toBeNull();
    });
  });

  describe('getRecentTrades', () => {
    it('returns trades in reverse chronological order', () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const t = service.recordTrade({
          listingId: 'listing-1',
          projectName: `Project ${i}`,
          projectType: 'Reforestation',
          verificationStatus: 'Verra (VCS)',
          vintageYear: 2023,
          location: 'Brazil',
          buyerId: 'b1',
          sellerId: 's1',
          side: 'buy',
          quantity: i + 1,
          pricePerTon: 10,
        });
        ids.push(t.id);
      }

      const recent = service.getRecentTrades(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].id).toBe(ids[4]);
      expect(recent[1].id).toBe(ids[3]);
      expect(recent[2].id).toBe(ids[2]);
    });

    it('respects maxRecentTrades config cap', () => {
      for (let i = 0; i < 20; i++) {
        service.recordTrade({
          listingId: 'listing-1',
          projectName: 'Project',
          projectType: 'Reforestation',
          verificationStatus: 'Verra (VCS)',
          vintageYear: 2023,
          location: 'Brazil',
          buyerId: 'b1',
          sellerId: 's1',
          side: 'buy',
          quantity: 1,
          pricePerTon: 10,
        });
      }

      expect(service.getRecentTrades(100)).toHaveLength(10);
    });
  });

  describe('getListingTrades', () => {
    it('returns only trades for the given listing', () => {
      service.recordTrade({
        listingId: 'listing-A',
        projectName: 'A',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 1,
        pricePerTon: 10,
      });
      service.recordTrade({
        listingId: 'listing-B',
        projectName: 'B',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 1,
        pricePerTon: 10,
      });

      const aTrades = service.getListingTrades('listing-A');
      const bTrades = service.getListingTrades('listing-B');

      expect(aTrades).toHaveLength(1);
      expect(aTrades[0].listingId).toBe('listing-A');
      expect(bTrades[0].listingId).toBe('listing-B');
    });

    it('returns empty array for unknown listing', () => {
      expect(service.getListingTrades('missing')).toEqual([]);
    });

    it('respects maxTradesPerListing cap', () => {
      for (let i = 0; i < 10; i++) {
        service.recordTrade({
          listingId: 'listing-1',
          projectName: 'Project',
          projectType: 'Reforestation',
          verificationStatus: 'Verra (VCS)',
          vintageYear: 2023,
          location: 'Brazil',
          buyerId: 'b1',
          sellerId: 's1',
          side: 'buy',
          quantity: 1,
          pricePerTon: 10,
        });
      }
      expect(service.getListingTrades('listing-1', 100)).toHaveLength(5);
    });
  });

  describe('getListingStats and getMarketStats', () => {
    it('computes lastPrice and volume for a listing', () => {
      service.recordTrade({
        listingId: 'listing-1',
        projectName: 'A',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 12,
      });
      service.recordTrade({
        listingId: 'listing-1',
        projectName: 'A',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b2',
        sellerId: 's2',
        side: 'buy',
        quantity: 5,
        pricePerTon: 15,
      });

      const stats = service.getListingStats('listing-1');
      expect(stats.lastPrice).toBe(15);
      expect(stats.volume24h).toBe(10 * 12 + 5 * 15);
      expect(stats.tradeCount24h).toBe(2);
      expect(stats.high24h).toBe(15);
      expect(stats.low24h).toBe(12);
    });

    it('aggregates market stats across all listings', () => {
      service.recordTrade({
        listingId: 'listing-A',
        projectName: 'A',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 1,
        pricePerTon: 10,
      });
      service.recordTrade({
        listingId: 'listing-B',
        projectName: 'B',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b2',
        sellerId: 's2',
        side: 'buy',
        quantity: 2,
        pricePerTon: 20,
      });

      const stats = service.getMarketStats();
      expect(stats.volume24h).toBe(10 + 40);
      expect(stats.tradeCount24h).toBe(2);
    });

    it('excludes non-filled trades from stats', () => {
      service.recordTrade({
        listingId: 'listing-1',
        projectName: 'A',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 12,
        status: 'pending',
      });

      const stats = service.getListingStats('listing-1');
      expect(stats.lastPrice).toBeNull();
      expect(stats.volume24h).toBe(0);
      expect(stats.tradeCount24h).toBe(0);
    });
  });

  describe('getListingTicker and getMarketTicker', () => {
    it('returns structured listing ticker', () => {
      const trade = service.recordTrade({
        listingId: 'listing-1',
        projectName: 'Project',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 10,
        pricePerTon: 12,
      });

      const ticker = service.getListingTicker('listing-1');
      expect(ticker.listingId).toBe('listing-1');
      expect(ticker.lastPrice).toBe(12);
      expect(ticker.volume24h).toBe(120);
      expect(ticker.trades.map((t) => t.id)).toContain(trade.id);
    });

    it('returns structured market ticker', () => {
      service.recordTrade({
        listingId: 'listing-A',
        projectName: 'A',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 1,
        pricePerTon: 10,
      });
      service.recordTrade({
        listingId: 'listing-B',
        projectName: 'B',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b2',
        sellerId: 's2',
        side: 'buy',
        quantity: 1,
        pricePerTon: 20,
      });

      const ticker = service.getMarketTicker();
      expect(ticker.globalStats.tradeCount24h).toBe(2);
      expect(Object.keys(ticker.listings)).toContain('listing-A');
      expect(Object.keys(ticker.listings)).toContain('listing-B');
      expect(ticker.recentTrades).toHaveLength(2);
    });
  });

  describe('getStats / clearAll', () => {
    it('reports counts and clears everything', () => {
      service.recordTrade({
        listingId: 'A',
        projectName: 'A',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 1,
        pricePerTon: 10,
      });
      service.recordTrade({
        listingId: 'B',
        projectName: 'B',
        projectType: 'Reforestation',
        verificationStatus: 'Verra (VCS)',
        vintageYear: 2023,
        location: 'Brazil',
        buyerId: 'b1',
        sellerId: 's1',
        side: 'buy',
        quantity: 1,
        pricePerTon: 10,
      });

      const s = service.getStats();
      expect(s.totalTrades).toBe(2);
      expect(s.listingsTracked).toBe(2);
      expect(s.recentTradeCount).toBe(2);

      service.clearAll();
      const after = service.getStats();
      expect(after.totalTrades).toBe(0);
      expect(after.listingsTracked).toBe(0);
      expect(after.recentTradeCount).toBe(0);
    });
  });

  describe('singleton getTickerService', () => {
    it('returns the same instance on repeated calls', () => {
      resetTickerService();
      const a = getTickerService();
      const b = getTickerService();
      expect(a).toBe(b);
    });
  });
});
