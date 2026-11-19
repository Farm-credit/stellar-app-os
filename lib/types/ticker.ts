export type TradeSide = 'buy' | 'sell';

export type TradeStatus = 'pending' | 'filled' | 'partial' | 'cancelled';

export interface CarbonCreditTradeFill {
  id: string;
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
  totalAmount: number;
  currency: string;
  status: TradeStatus;
  txHash?: string;
  filledAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TickerStats {
  lastPrice: number | null;
  priceChange24h: number;
  priceChangePercent24h: number;
  high24h: number | null;
  low24h: number | null;
  volume24h: number;
  tradeCount24h: number;
  timestamp: string;
}

export interface ListingTickerUpdate {
  listingId: string;
  lastPrice: number | null;
  volume24h: number;
  trades: CarbonCreditTradeFill[];
}

export interface MarketTickerUpdate {
  listings: Record<string, ListingTickerUpdate>;
  globalStats: TickerStats;
  recentTrades: CarbonCreditTradeFill[];
}

export type TickerEventName =
  | 'trade:new'
  | 'trade:update'
  | 'ticker:update'
  | 'listing:ticker'
  | 'market:ticker'
  | 'error';

export interface TickerClientToServerEvents {
  'listing:subscribe': (listingId: string) => void;
  'listing:unsubscribe': (listingId: string) => void;
  'market:subscribe': () => void;
  'market:unsubscribe': () => void;
  'trades:recent': (limit?: number) => void;
  ping: (timestamp: number) => void;
}

export interface TickerServerToClientEvents {
  'trade:new': (trade: CarbonCreditTradeFill) => void;
  'trade:update': (trade: CarbonCreditTradeFill) => void;
  'ticker:update': (update: MarketTickerUpdate) => void;
  'listing:ticker': (update: ListingTickerUpdate) => void;
  'market:ticker': (update: MarketTickerUpdate) => void;
  'trades:recent': (trades: CarbonCreditTradeFill[]) => void;
  pong: (timestamp: number) => void;
  error: (message: string, details?: unknown) => void;
}

export interface TickerSocketData {
  subscribedListings: Set<string>;
  subscribedMarket: boolean;
  connectedAt: number;
}
