import type {
  CarbonCreditTradeFill,
  ListingTickerUpdate,
  MarketTickerUpdate,
  TickerStats,
  TradeSide,
  TradeStatus,
} from '@/lib/types/ticker';
import logger from '@/lib/logger';
import { EventEmitter } from 'events';

const MS_PER_24H = 24 * 60 * 60 * 1000;

export interface TickerServiceConfig {
  maxRecentTrades: number;
  maxTradesPerListing: number;
  statsWindowMs: number;
}

const DEFAULT_CONFIG: TickerServiceConfig = {
  maxRecentTrades: 100,
  maxTradesPerListing: 50,
  statsWindowMs: MS_PER_24H,
};

export type TickerServiceEvent =
  | { type: 'trade:new'; trade: CarbonCreditTradeFill }
  | { type: 'trade:update'; trade: CarbonCreditTradeFill }
  | { type: 'ticker:update'; update: MarketTickerUpdate };

export class TickerService extends EventEmitter {
  private config: TickerServiceConfig;

  private trades: Map<string, CarbonCreditTradeFill> = new Map();
  private listingTrades: Map<string, CarbonCreditTradeFill[]> = new Map();
  private recentTrades: CarbonCreditTradeFill[] = [];

  constructor(config: Partial<TickerServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setMaxListeners(1000);
  }

  recordTrade(input: {
    listingId: string;
    projectName: string;
    projectType: string;
    verificationStatus: string;
    vintageYear: number;
    location: string;
    buyerId: string;
    sellerId: string;
    side: TradeSide;
    quantity: number;
    pricePerTon: number;
    totalAmount?: number;
    currency?: string;
    status?: TradeStatus;
    txHash?: string;
    filledAt?: string;
  }): CarbonCreditTradeFill {
    const now = new Date().toISOString();
    const totalAmount = input.totalAmount ?? input.quantity * input.pricePerTon;
    const currency = input.currency ?? 'USD';
    const status: TradeStatus = input.status ?? 'filled';
    const filledAt = input.filledAt ?? now;

    const trade: CarbonCreditTradeFill = {
      id: this.generateTradeId(),
      listingId: input.listingId,
      projectName: input.projectName,
      projectType: input.projectType,
      verificationStatus: input.verificationStatus,
      vintageYear: input.vintageYear,
      location: input.location,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      side: input.side,
      quantity: input.quantity,
      pricePerTon: input.pricePerTon,
      totalAmount,
      currency,
      status,
      txHash: input.txHash,
      filledAt,
      createdAt: now,
      updatedAt: now,
    };

    this.trades.set(trade.id, trade);
    this.addToListingTrades(trade);
    this.addToRecentTrades(trade);

    logger.info('trade recorded', {
      tradeId: trade.id,
      listingId: trade.listingId,
      quantity: trade.quantity,
      pricePerTon: trade.pricePerTon,
      totalAmount: trade.totalAmount,
      status: trade.status,
    });

    this.emit('event', { type: 'trade:new', trade } satisfies TickerServiceEvent);
    this.emitTickerUpdate();

    return trade;
  }

  updateTradeStatus(tradeId: string, status: TradeStatus, txHash?: string): CarbonCreditTradeFill | null {
    const trade = this.trades.get(tradeId);
    if (!trade) {
      logger.warn('updateTradeStatus: trade not found', { tradeId });
      return null;
    }

    trade.status = status;
    trade.updatedAt = new Date().toISOString();
    if (txHash !== undefined) {
      trade.txHash = txHash;
    }

    logger.info('trade status updated', { tradeId, status, txHash: txHash?.slice(0, 12) });

    this.emit('event', { type: 'trade:update', trade } satisfies TickerServiceEvent);
    this.emitTickerUpdate();

    return trade;
  }

  getTradeById(tradeId: string): CarbonCreditTradeFill | null {
    return this.trades.get(tradeId) ?? null;
  }

  getRecentTrades(limit = 20): CarbonCreditTradeFill[] {
    const safeLimit = Math.min(limit, this.config.maxRecentTrades);
    return this.recentTrades.slice(0, safeLimit);
  }

  getListingTrades(listingId: string, limit = 20): CarbonCreditTradeFill[] {
    const trades = this.listingTrades.get(listingId) ?? [];
    return trades.slice(0, Math.min(limit, this.config.maxTradesPerListing));
  }

  getListingStats(listingId: string): TickerStats {
    const now = Date.now();
    const windowStart = now - this.config.statsWindowMs;
    const trades = (this.listingTrades.get(listingId) ?? []).filter(
      (t) => t.status === 'filled' && new Date(t.filledAt).getTime() >= windowStart
    );

    return this.calculateStats(trades);
  }

  getMarketStats(): TickerStats {
    const now = Date.now();
    const windowStart = now - this.config.statsWindowMs;
    const allTrades = Array.from(this.trades.values()).filter(
      (t) => t.status === 'filled' && new Date(t.filledAt).getTime() >= windowStart
    );

    return this.calculateStats(allTrades);
  }

  getListingTicker(listingId: string): ListingTickerUpdate {
    const stats = this.getListingStats(listingId);
    const trades = this.getListingTrades(listingId);

    return {
      listingId,
      lastPrice: stats.lastPrice,
      volume24h: stats.volume24h,
      trades,
    };
  }

  getMarketTicker(): MarketTickerUpdate {
    const listings: Record<string, ListingTickerUpdate> = {};
    for (const listingId of this.listingTrades.keys()) {
      listings[listingId] = this.getListingTicker(listingId);
    }

    return {
      listings,
      globalStats: this.getMarketStats(),
      recentTrades: this.getRecentTrades(20),
    };
  }

  clearAll(): void {
    this.trades.clear();
    this.listingTrades.clear();
    this.recentTrades = [];
    logger.info('ticker service cleared');
  }

  getStats(): {
    totalTrades: number;
    listingsTracked: number;
    recentTradeCount: number;
  } {
    return {
      totalTrades: this.trades.size,
      listingsTracked: this.listingTrades.size,
      recentTradeCount: this.recentTrades.length,
    };
  }

  private calculateStats(trades: CarbonCreditTradeFill[]): TickerStats {
    const now = Date.now();
    const windowStart = now - this.config.statsWindowMs;

    const filled = trades.filter((t) => t.status === 'filled');

    const prices = filled.map((t) => t.pricePerTon);
    const lastPrice = prices.length > 0 ? prices[0] : null;

    const now24 = new Date();
    const startOfWindow = new Date(now24.getTime() - this.config.statsWindowMs);
    const earlierWindow: CarbonCreditTradeFill[] = [];
    const currentWindow: CarbonCreditTradeFill[] = [];

    for (const t of filled) {
      const ts = new Date(t.filledAt).getTime();
      if (ts >= windowStart) {
        currentWindow.push(t);
      } else if (ts >= startOfWindow.getTime() - this.config.statsWindowMs) {
        earlierWindow.push(t);
      }
    }

    const currentPrices = currentWindow.map((t) => t.pricePerTon);
    const earlierPrices = earlierWindow.map((t) => t.pricePerTon);

    const currentAvg =
      currentPrices.length > 0
        ? currentPrices.reduce((a, b) => a + b, 0) / currentPrices.length
        : 0;
    const earlierAvg =
      earlierPrices.length > 0
        ? earlierPrices.reduce((a, b) => a + b, 0) / earlierPrices.length
        : 0;

    const priceChange24h = currentAvg - earlierAvg;
    const priceChangePercent24h = earlierAvg > 0 ? (priceChange24h / earlierAvg) * 100 : 0;

    const high24h = currentPrices.length > 0 ? Math.max(...currentPrices) : null;
    const low24h = currentPrices.length > 0 ? Math.min(...currentPrices) : null;

    const volume24h = currentWindow.reduce((sum, t) => sum + t.totalAmount, 0);
    const tradeCount24h = currentWindow.length;

    return {
      lastPrice,
      priceChange24h,
      priceChangePercent24h,
      high24h,
      low24h,
      volume24h,
      tradeCount24h,
      timestamp: new Date().toISOString(),
    };
  }

  private addToListingTrades(trade: CarbonCreditTradeFill): void {
    const existing = this.listingTrades.get(trade.listingId) ?? [];
    existing.unshift(trade);
    if (existing.length > this.config.maxTradesPerListing) {
      existing.length = this.config.maxTradesPerListing;
    }
    this.listingTrades.set(trade.listingId, existing);
  }

  private addToRecentTrades(trade: CarbonCreditTradeFill): void {
    this.recentTrades.unshift(trade);
    if (this.recentTrades.length > this.config.maxRecentTrades) {
      this.recentTrades.length = this.config.maxRecentTrades;
    }
  }

  private emitTickerUpdate(): void {
    const update = this.getMarketTicker();
    this.emit('event', { type: 'ticker:update', update } satisfies TickerServiceEvent);
  }

  private generateTradeId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `trade_${ts}_${rand}`;
  }
}

let singletonInstance: TickerService | null = null;

export function getTickerService(config?: Partial<TickerServiceConfig>): TickerService {
  if (!singletonInstance) {
    singletonInstance = new TickerService(config);
    logger.info('ticker service singleton created');
  }
  return singletonInstance;
}

export function resetTickerService(): void {
  singletonInstance = null;
}
