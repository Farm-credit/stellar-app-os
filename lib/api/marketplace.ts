import type { MarketplaceListing as Listing } from '../types/marketplace';

export type AuctionStatus = 'open' | 'closed' | 'cancelled';

export interface Bid {
  id: string;
  auctionId: string;
  bidderId: string;
  bidderName?: string;
  amountPerTon: number;
  quantity: number;
  createdAt: string;
}

export interface Auction {
  id: string;
  sellerId: string;
  sellerName: string;
  projectName: string;
  projectType: string;
  quantity: number;
  reservePricePerTon: number;
  minBidIncrement?: number;
  status: AuctionStatus;
  createdAt: string;
  closingAt: string;
  location?: string;
  verificationStatus?: string;
  winnerBidId?: string;
  winningBid?: Bid;
  resolvedAt?: string;
}

export interface AuctionResolution {
  auction: Auction;
  winner: Bid | null;
  losers: Bid[];
  reason?: string;
}

export type HistoricalGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface HistoricalDataQuery {
  startDate: string;
  endDate: string;
  granularity?: HistoricalGranularity;
  region?: string;
  projectType?: string;
}

export interface HistoricalDataPoint {
  period: string;
  totalVolume: number;
  totalValue: number;
  averagePricePerTon: number;
  transactionCount: number;
}

export interface HistoricalCarbonData {
  query: HistoricalDataQuery;
  series: HistoricalDataPoint[];
  totals: {
    totalVolume: number;
    totalValue: number;
    averagePricePerTon: number;
    transactionCount: number;
  };
}

export interface ProjectPerformancePoint {
  period: string;
  volume: number;
  value: number;
  averagePricePerTon: number;
}

export interface ProjectPerformanceHistory {
  projectName: string;
  projectType: string;
  region?: string;
  series: ProjectPerformancePoint[];
}

export interface BuyerTrendPoint {
  period: string;
  buyerCount: number;
  newBuyers: number;
  totalVolume: number;
  totalValue: number;
}

export interface BuyerTrends {
  region?: string;
  projectType?: string;
  series: BuyerTrendPoint[];
}

export type CertificationProvider = 'verra' | 'gold-standard';

export interface CertificationProjectData {
  provider: CertificationProvider;
  projectId: string;
  projectName: string;
  projectType: string;
  region?: string;
  status: string;
  verifiedCredits: number;
  renewalDueAt?: string;
  lastSyncedAt: string;
  raw?: unknown;
}

export interface CreditVerificationResult {
  provider: CertificationProvider;
  serialNumber: string;
  verified: boolean;
  projectId?: string;
  vintageYear?: number;
  retired?: boolean;
  message?: string;
  checkedAt: string;
}

interface CreditPurchaseBatch {
  id: string;
  projectName: string;
  projectType: string;
  region?: string;
  buyerId: string;
  quantity: number;
  pricePerTon: number;
  purchasedAt: string;
}

interface TransactionRecord {
  id: string;
  projectName: string;
  projectType: string;
  region?: string;
  buyerId: string;
  quantity: number;
  pricePerTon: number;
  occurredAt: string;
}

const MOCK_AUCTIONS: Record<string, Auction> = {};
const MOCK_BIDS: Record<string, Bid[]> = {};

const MOCK_PURCHASE_BATCHES: CreditPurchaseBatch[] = [
  {
    id: 'batch-1',
    projectName: 'Amazon Rainforest Reforestation',
    projectType: 'Reforestation',
    region: 'South America',
    buyerId: 'GBUYER000000000000000000000000000000000000000000000001',
    quantity: 200,
    pricePerTon: 12.0,
    purchasedAt: '2024-01-20T00:00:00Z',
  },
  {
    id: 'batch-2',
    projectName: 'Sahara Solar Farm Expansion',
    projectType: 'Renewable Energy',
    region: 'Africa',
    buyerId: 'GBUYER000000000000000000000000000000000000000000000002',
    quantity: 80,
    pricePerTon: 15.5,
    purchasedAt: '2024-02-10T00:00:00Z',
  },
  {
    id: 'batch-3',
    projectName: 'Amazon Rainforest Reforestation',
    projectType: 'Reforestation',
    region: 'South America',
    buyerId: 'GBUYER000000000000000000000000000000000000000000000002',
    quantity: 150,
    pricePerTon: 13.25,
    purchasedAt: '2024-03-05T00:00:00Z',
  },
];

const MOCK_TRANSACTIONS: TransactionRecord[] = [
  {
    id: 'tx-1',
    projectName: 'Amazon Rainforest Reforestation',
    projectType: 'Reforestation',
    region: 'South America',
    buyerId: 'GBUYER000000000000000000000000000000000000000000000003',
    quantity: 50,
    pricePerTon: 12.75,
    occurredAt: '2024-01-25T00:00:00Z',
  },
  {
    id: 'tx-2',
    projectName: 'Sahara Solar Farm Expansion',
    projectType: 'Renewable Energy',
    region: 'Africa',
    buyerId: 'GBUYER000000000000000000000000000000000000000000000001',
    quantity: 40,
    pricePerTon: 15.0,
    occurredAt: '2024-02-15T00:00:00Z',
  },
];

let auctionIdCounter = 0;
let bidIdCounter = 0;

function generateAuctionId(): string {
  auctionIdCounter += 1;
  return `auction-${Date.now()}-${auctionIdCounter}`;
}

function generateBidId(): string {
  bidIdCounter += 1;
  return `bid-${Date.now()}-${bidIdCounter}`;
}

export async function createAuction(
  input: Omit<Auction, 'id' | 'status' | 'createdAt' | 'winnerBidId' | 'winningBid' | 'resolvedAt'>,
): Promise<Auction> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const auction: Auction = {
    ...input,
    id: generateAuctionId(),
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  MOCK_AUCTIONS[auction.id] = auction;
  MOCK_BIDS[auction.id] = [];
  return auction;
}

export async function getAuction(id: string): Promise<Auction | null> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return MOCK_AUCTIONS[id] ?? null;
}

export async function listAuctions(filter?: {
  status?: AuctionStatus;
  projectType?: string;
  sellerId?: string;
}): Promise<Auction[]> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return Object.values(MOCK_AUCTIONS).filter((auction) => {
    if (filter?.status && auction.status !== filter.status) return false;
    if (filter?.projectType && auction.projectType !== filter.projectType) return false;
    if (filter?.sellerId && auction.sellerId !== filter.sellerId) return false;
    return true;
  });
}

export async function placeBid(
  auctionId: string,
  input: { bidderId: string; bidderName?: string; amountPerTon: number; quantity: number },
): Promise<Bid> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const auction = MOCK_AUCTIONS[auctionId];
  if (!auction) throw new Error(`Auction ${auctionId} not found`);
  if (auction.status !== 'open') throw new Error(`Auction ${auctionId} is not open for bidding`);
  if (new Date(auction.closingAt).getTime() <= Date.now()) {
    throw new Error(`Auction ${auctionId} has already closed`);
  }
  if (input.amountPerTon <= 0) throw new Error('Bid amount must be positive');
  if (input.quantity <= 0) throw new Error('Bid quantity must be positive');
  if (input.quantity > auction.quantity) {
    throw new Error('Bid quantity exceeds auction quantity');
  }

  const existingBids = MOCK_BIDS[auctionId] ?? [];
  const highest = existingBids.reduce<Bid | null>(
    (best, bid) => (best === null || bid.amountPerTon > best.amountPerTon ? bid : best),
    null,
  );
  const minIncrement = auction.minBidIncrement ?? 0;
  if (highest && input.amountPerTon < highest.amountPerTon + minIncrement) {
    throw new Error(
      `Bid must be at least ${(highest.amountPerTon + minIncrement).toFixed(2)} per ton`,
    );
  }

  const bid: Bid = {
    id: generateBidId(),
    auctionId,
    bidderId: input.bidderId,
    bidderName: input.bidderName,
    amountPerTon: input.amountPerTon,
    quantity: input.quantity,
    createdAt: new Date().toISOString(),
  };
  existingBids.push(bid);
  MOCK_BIDS[auctionId] = existingBids;
  return bid;
}

export async function getBidsForAuction(auctionId: string): Promise<Bid[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return [...(MOCK_BIDS[auctionId] ?? [])].sort(
    (a, b) => b.amountPerTon - a.amountPerTon || a.createdAt.localeCompare(b.createdAt),
  );
}

export async function resolveAuction(auctionId: string): Promise<AuctionResolution> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const auction = MOCK_AUCTIONS[auctionId];
  if (!auction) throw new Error(`Auction ${auctionId} not found`);
  if (auction.status === 'cancelled') {
    throw new Error(`Auction ${auctionId} was cancelled`);
  }
  if (auction.status === 'closed') {
    return {
      auction,
      winner: auction.winningBid ?? null,
      losers: [],
      reason: 'Auction already resolved',
    };
  }

  const bids = MOCK_BIDS[auctionId] ?? [];
  const eligible = bids.filter((bid) => bid.amountPerTon >= auction.reservePricePerTon);

  if (eligible.length === 0) {
    auction.status = 'closed';
    auction.resolvedAt = new Date().toISOString();
    return {
      auction,
      winner: null,
      losers: [...bids],
      reason: 'No bids met the reserve price',
    };
  }

  const sorted = [...eligible].sort(
    (a, b) => b.amountPerTon - a.amountPerTon || a.createdAt.localeCompare(b.createdAt),
  );
  const winner = sorted[0];
  const losers = bids.filter((bid) => bid.id !== winner.id);

  auction.status = 'closed';
  auction.winnerBidId = winner.id;
  auction.winningBid = winner;
  auction.resolvedAt = new Date().toISOString();

  return { auction, winner, losers };
}

function getPeriodKey(date: Date, granularity: HistoricalGranularity): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  switch (granularity) {
    case 'day':
      return date.toISOString().slice(0, 10);
    case 'week': {
      const firstDay = new Date(Date.UTC(year, 0, 1));
      const dayOffset = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
      const week = Math.floor(dayOffset / 7) + 1;
      return `${year}-W${String(week).padStart(2, '0')}`;
    }
    case 'quarter':
      return `${year}-Q${Math.floor(month / 3) + 1}`;
    case 'year':
      return `${year}`;
    case 'month':
    default:
      return `${year}-${String(month + 1).padStart(2, '0')}`;
  }
}

interface AggregationRecord {
  projectName: string;
  projectType: string;
  region?: string;
  buyerId: string;
  quantity: number;
  pricePerTon: number;
  occurredAt: string;
}

function collectRecords(): AggregationRecord[] {
  const records: AggregationRecord[] = [];
  for (const batch of MOCK_PURCHASE_BATCHES) {
    records.push({
      projectName: batch.projectName,
      projectType: batch.projectType,
      region: batch.region,
      buyerId: batch.buyerId,
      quantity: batch.quantity,
      pricePerTon: batch.pricePerTon,
      occurredAt: batch.purchasedAt,
    });
  }
  for (const tx of MOCK_TRANSACTIONS) {
    records.push({
      projectName: tx.projectName,
      projectType: tx.projectType,
      region: tx.region,
      buyerId: tx.buyerId,
      quantity: tx.quantity,
      pricePerTon: tx.pricePerTon,
      occurredAt: tx.occurredAt,
    });
  }
  for (const listing of Object.values(MOCK_LISTINGS)) {
    if (!listing.isActive) continue;
    records.push({
      projectName: listing.projectName,
      projectType: listing.projectType,
      region: listing.location,
      buyerId: listing.sellerId,
      quantity: listing.quantity,
      pricePerTon: listing.pricePerTon,
      occurredAt: listing.listedAt,
    });
  }
  return records;
}

function filterRecords(records: AggregationRecord[], query: HistoricalDataQuery): AggregationRecord[] {
  const start = new Date(query.startDate).getTime();
  const end = new Date(query.endDate).getTime();
  return records.filter((record) => {
    const time = new Date(record.occurredAt).getTime();
    if (Number.isNaN(time) || time < start || time > end) return false;
    if (query.projectType && record.projectType !== query.projectType) return false;
    if (query.region && record.region !== query.region) return false;
    return true;
  });
}

export async function getHistoricalCarbonData(
  query: HistoricalDataQuery,
): Promise<HistoricalCarbonData> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const granularity = query.granularity ?? 'month';
  const records = filterRecords(collectRecords(), query);

  const buckets = new Map<string, { volume: number; value: number; count: number }>();
  for (const record of records) {
    const key = getPeriodKey(new Date(record.occurredAt), granularity);
    const bucket = buckets.get(key) ?? { volume: 0, value: 0, count: 0 };
    bucket.volume += record.quantity;
    bucket.value += record.quantity * record.pricePerTon;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const series: HistoricalDataPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, bucket]) => ({
      period,
      totalVolume: bucket.volume,
      totalValue: bucket.value,
      averagePricePerTon: bucket.volume > 0 ? bucket.value / bucket.volume : 0,
      transactionCount: bucket.count,
    }));

  const totalVolume = series.reduce((sum, point) => sum + point.totalVolume, 0);
  const totalValue = series.reduce((sum, point) => sum + point.totalValue, 0);
  const transactionCount = series.reduce((sum, point) => sum + point.transactionCount, 0);

  return {
    query: { ...query, granularity },
    series,
    totals: {
      totalVolume,
      totalValue,
      averagePricePerTon: totalVolume > 0 ? totalValue / totalVolume : 0,
      transactionCount,
    },
  };
}

export async function getProjectPerformanceHistory(
  projectName: string,
  query: HistoricalDataQuery,
): Promise<ProjectPerformanceHistory> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const granularity = query.granularity ?? 'month';
  const records = filterRecords(collectRecords(), query).filter(
    (record) => record.projectName === projectName,
  );

  const buckets = new Map<string, { volume: number; value: number }>();
  for (const record of records) {
    const key = getPeriodKey(new Date(record.occurredAt), granularity);
    const bucket = buckets.get(key) ?? { volume: 0, value: 0 };
    bucket.volume += record.quantity;
    bucket.value += record.quantity * record.pricePerTon;
    buckets.set(key, bucket);
  }

  const series: ProjectPerformancePoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, bucket]) => ({
      period,
      volume: bucket.volume,
      value: bucket.value,
      averagePricePerTon: bucket.volume > 0 ? bucket.value / bucket.volume : 0,
    }));

  const sample = records[0];
  return {
    projectName,
    projectType: sample?.projectType ?? query.projectType ?? 'Unknown',
    region: sample?.region,
    series,
  };
}

export async function getBuyerTrends(query: HistoricalDataQuery): Promise<BuyerTrends> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const granularity = query.granularity ?? 'month';
  const records = filterRecords(collectRecords(), query);

  const buckets = new Map<
    string,
    { buyers: Set<string>; volume: number; value: number }
  >();
  const seenBuyers = new Set<string>();

  const sorted = [...records].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (const record of sorted) {
    const key = getPeriodKey(new Date(record.occurredAt), granularity);
    const bucket = buckets.get(key) ?? { buyers: new Set<string>(), volume: 0, value: 0 };
    bucket.buyers.add(record.buyerId);
    bucket.volume += record.quantity;
    bucket.value += record.quantity * record.pricePerTon;
    buckets.set(key, bucket);
  }

  const series: BuyerTrendPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, bucket]) => {
      let newBuyers = 0;
      for (const buyer of bucket.buyers) {
        if (!seenBuyers.has(buyer)) {
          seenBuyers.add(buyer);
          newBuyers += 1;
        }
      }
      return {
        period,
        buyerCount: bucket.buyers.size,
        newBuyers,
        totalVolume: bucket.volume,
        totalValue: bucket.value,
      };
    });

  return { region: query.region, projectType: query.projectType, series };
}

export async function syncCertificationProject(
  provider: CertificationProvider,
  projectId: string,
): Promise<CertificationProjectData> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const { getCertificationProvider } = await import('./certification');
  const client = getCertificationProvider(provider);
  const project = await client.fetchProject(projectId);
  return {
    provider,
    projectId,
    projectName: project.projectName,
    projectType: project.projectType,
    region: project.region,
    status: project.status,
    verifiedCredits: project.verifiedCredits,
    renewalDueAt: project.renewalDueAt,
    lastSyncedAt: new Date().toISOString(),
    raw: project,
  };
}

export async function verifyCreditCertification(
  provider: CertificationProvider,
  serialNumber: string,
): Promise<CreditVerificationResult> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const { getCertificationProvider } = await import('./certification');
  const client = getCertificationProvider(provider);
  const result = await client.verifyCredit(serialNumber);
  return {
    provider,
    serialNumber,
    verified: result.verified,
    projectId: result.projectId,
    vintageYear: result.vintageYear,
    retired: result.retired,
    message: result.message,
    checkedAt: new Date().toISOString(),
  };
}

const MOCK_LISTINGS: Record<string, Listing> = {
  '1': {
    id: '1',
    sellerId: 'GCXAMPLE1234567890ABCDEF',
    sellerName: 'GreenEarth Fund',
    projectName: 'Amazon Rainforest Reforestation',
    projectType: 'Reforestation',
    quantity: 500,
    pricePerTon: 12.5,
    totalPrice: 6250,
    vintageYear: 2022,
    verificationStatus: 'Verra (VCS)',
    fundingStatus: 'Open',
    listedAt: '2024-01-15T00:00:00Z',
    closingAt: '2024-06-30T00:00:00Z',
    location: 'Amazon Basin, Brazil',
    isActive: true,
    fundingStatus: 'Open',
    closingAt: '2024-12-31T00:00:00Z',
  },
  '2': {
    id: '2',
    sellerId: 'GCXAMPLE9876543210FEDCBA',
    sellerName: 'SolarVerde Corp',
    projectName: 'Sahara Solar Farm Expansion',
    projectType: 'Renewable Energy',
    quantity: 100,
    pricePerTon: 15.0,
    totalPrice: 1500,
    vintageYear: 2023,
    verificationStatus: 'Gold Standard',
    fundingStatus: 'Open',
    listedAt: '2024-02-01T00:00:00Z',
    closingAt: '2024-07-31T00:00:00Z',
    location: 'Sahara Desert, Morocco',
    isActive: true,
    fundingStatus: 'Closing Soon',
    closingAt: '2025-03-31T00:00:00Z',
  },
};

export async function getListingById(id: string): Promise<Listing | null> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return MOCK_LISTINGS[id] ?? null;
}

export async function checkAvailability(id: string, requestedQuantity: number): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const listing = MOCK_LISTINGS[id];
  if (!listing) return false;
  return listing.quantity >= requestedQuantity;
}
