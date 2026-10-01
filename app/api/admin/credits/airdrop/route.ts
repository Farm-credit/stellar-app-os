import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { mockAdminUsers } from '@/lib/api/mock/adminUsers';
import type {
  AirdropRequest,
  AirdropPreview,
  AirdropResult,
  AirdropRecipient,
} from '@/lib/types/carbon';

// Farmer payment processing (v1) - multi-currency support
type PaymentCurrency = 'XLM' | 'USDC' | 'FIAT';
type PaymentMethod = 'bank_transfer' | 'crypto_wallet' | 'payment_app';

interface FarmerPaymentRequest {
  farmerId: string;
  amount: number;
  currency: PaymentCurrency;
  method: PaymentMethod;
  destination: string;
  memo?: string;
}

interface FarmerPaymentResult {
  farmerId: string;
  amount: number;
  currency: PaymentCurrency;
  method: PaymentMethod;
  status: 'queued' | 'failed';
  reference?: string;
  error?: string;
}

const SUPPORTED_CURRENCIES: PaymentCurrency[] = ['XLM', 'USDC', 'FIAT'];
const SUPPORTED_METHODS: PaymentMethod[] = ['bank_transfer', 'crypto_wallet', 'payment_app'];

// Method compatibility: which payment methods can settle each currency.
const METHOD_CURRENCY_SUPPORT: Record<PaymentMethod, PaymentCurrency[]> = {
  bank_transfer: ['FIAT'],
  crypto_wallet: ['XLM', 'USDC'],
  payment_app: ['FIAT', 'USDC'],
};

// Per-currency validation rules for the destination field.
const DESTINATION_VALIDATORS: Record<PaymentCurrency, (destination: string) => string | null> = {
  XLM: (destination) =>
    /^G[A-Z2-7]{56}$/.test(destination)
      ? null
      : 'destination must be a valid Stellar public key (G...) for XLM payments',
  USDC: (destination) =>
    /^G[A-Z2-7]{56}$/.test(destination)
      ? null
      : 'destination must be a valid Stellar public key (G...) for USDC payments',
  FIAT: (destination) =>
    destination.trim().length >= 4
      ? null
      : 'destination must be a valid bank account or payment app handle for FIAT payments',
};

function validateFarmerPayment(payment: FarmerPaymentRequest): string | null {
  if (!payment.farmerId) return 'farmerId is required';
  if (!payment.amount || payment.amount <= 0) return 'amount must be greater than zero';
  if (!SUPPORTED_CURRENCIES.includes(payment.currency)) {
    return `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`;
  }
  if (!SUPPORTED_METHODS.includes(payment.method)) {
    return `method must be one of: ${SUPPORTED_METHODS.join(', ')}`;
  }
  if (!payment.destination) return 'destination is required';

  const supportedCurrencies = METHOD_CURRENCY_SUPPORT[payment.method];
  if (!supportedCurrencies.includes(payment.currency)) {
    return `method ${payment.method} does not support currency ${payment.currency}; supported: ${supportedCurrencies.join(', ')}`;
  }

  const destinationError = DESTINATION_VALIDATORS[payment.currency](payment.destination);
  if (destinationError) return destinationError;

  return null;
}

function processFarmerPayments(payments: FarmerPaymentRequest[]): FarmerPaymentResult[] {
  return payments.map((payment) => {
    const validationError = validateFarmerPayment(payment);
    if (validationError) {
      return {
        farmerId: payment.farmerId,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        status: 'failed' as const,
        error: validationError,
      };
    }
    // TODO: replace with real payment rail integration (Stellar for XLM/USDC, fiat provider for FIAT)
    return {
      farmerId: payment.farmerId,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      status: 'queued' as const,
      reference: `pay_${payment.farmerId}_${Date.now()}`,
    };
  });
}

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // per window
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

const requestTimestamps = new Map<string, number[]>();
const blockedUntil = new Map<string, number>();
const violationCount = new Map<string, number>();

function getClientKeys(request: Request): string[] {
  const keys: string[] = [];
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  if (ip) keys.push(`ip:${ip}`);
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) keys.push(`apiKey:${apiKey}`);
  if (keys.length === 0) keys.push('unknown');
  return keys;
}

function checkRateLimit(key: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const blockedUntilTime = blockedUntil.get(key) ?? 0;

  if (now < blockedUntilTime) {
    return { allowed: false, retryAfter: blockedUntilTime - now };
  }

  const timestamps = (requestTimestamps.get(key) ?? []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    // Calculate how long until the oldest request in the window expires
    const oldestTimestamp = timestamps[0];
    const retryAfter = Math.max(1, oldestTimestamp + RATE_LIMIT_WINDOW_MS - now);

    // Apply exponential backoff
    const violations = (violationCount.get(key) ?? 0) + 1;
    violationCount.set(key, violations);
    const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, violations - 1), MAX_BACKOFF_MS);
    blockedUntil.set(key, now + Math.max(retryAfter, backoffMs));

    return { allowed: false, retryAfter: Math.max(retryAfter, backoffMs) };
  }

  // Allow request and record it
  timestamps.push(now);
  requestTimestamps.set(key, timestamps);
  // Reset violation count on successful request
  violationCount.set(key, 0);
  return { allowed: true };
}

function enforceRateLimit(request: Request): NextResponse | null {
  const keys = getClientKeys(request);
  for (const key of keys) {
    const result = checkRateLimit(key);
    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests, please slow down.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((result.retryAfter ?? 0) / 1000)) },
        }
      );
    }
  }
  return null;
}

// Audit logging helper
function logAudit(action: string, details: Record<string, unknown>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    ...details,
  };
  console.log(`[audit] ${JSON.stringify(entry)}`);
}

// Carbon credit fractionalization - retail access
// Minimum purchase is 1 ton instead of 100+ ton blocks.
const MINIMUM_PURCHASE_TONS = 1;
const MAX_FRACTIONAL_TONS = 1000000;

interface FractionalizationRequest {
  projectId: string;
  totalTons: number;
  minimumPurchaseTons?: number;
}

interface FractionalizationResult {
  projectId: string;
  totalTons: number;
  minimumPurchaseTons: number;
  availableUnits: number;
  status: 'queued' | 'failed';
  error?: string;
}

function validateFractionalization(request: FractionalizationRequest): string | null {
  if (!request.projectId) return 'projectId is required';
  if (!request.totalTons || request.totalTons <= 0) {
    return 'totalTons must be greater than zero';
  }
  if (request.totalTons > MAX_FRACTIONAL_TONS) {
    return `totalTons exceeds maximum of ${MAX_FRACTIONAL_TONS}`;
  }
  const minimum = request.minimumPurchaseTons ?? MINIMUM_PURCHASE_TONS;
  if (minimum < MINIMUM_PURCHASE_TONS) {
    return `minimumPurchaseTons must be at least ${MINIMUM_PURCHASE_TONS} ton`;
  }
  if (minimum > request.totalTons) {
    return 'minimumPurchaseTons cannot exceed totalTons';
  }
  if (!Number.isInteger(minimum)) {
    return 'minimumPurchaseTons must be a whole number of tons';
  }
  return null;
}

function fractionalizeProject(request: FractionalizationRequest): FractionalizationResult {
  const validationError = validateFractionalization(request);
  if (validationError) {
    return {
      projectId: request.projectId,
      totalTons: request.totalTons,
      minimumPurchaseTons: request.minimumPurchaseTons ?? MINIMUM_PURCHASE_TONS,
      availableUnits: 0,
      status: 'failed',
      error: validationError,
    };
  }

  const minimum = request.minimumPurchaseTons ?? MINIMUM_PURCHASE_TONS;
  const availableUnits = Math.floor(request.totalTons / minimum);

  // TODO: replace with real Stellar CARBON token minting for fractional units
  return {
    projectId: request.projectId,
    totalTons: request.totalTons,
    minimumPurchaseTons: minimum,
    availableUnits: availableUnits,
    status: 'queued',
  };
}

// -----------------------------------------------------------------------------
// Auction mechanism - competitive bidding (v1)
// Farmers auction carbon credits to multiple buyers. Buyers place bids.
// Highest bidder wins. Transparent price discovery.
// -----------------------------------------------------------------------------

type AuctionStatus = 'open' | 'closed' | 'settled' | 'cancelled';

interface AuctionBid {
  bidId: string;
  buyerId: string;
  amountPerTon: number;
  tons: number;
  placedAt: string;
}

interface Auction {
  auctionId: string;
  farmerId: string;
  projectId: string;
  tonsOffered: number;
  reservePricePerTon: number;
  closesAt: string;
  status: AuctionStatus;
  bids: AuctionBid[];
}

interface AuctionCreateRequest {
  farmerId: string;
  projectId: string;
  tonsOffered: number;
  reservePricePerTon: number;
  closesAt: string;
}

interface AuctionBidRequest {
  auctionId: string;
  buyerId: string;
  amountPerTon: number;
  tons: number;
}

interface AuctionSettlement {
  auctionId: string;
  status: AuctionStatus;
  winningBid?: AuctionBid;
  totalValue?: number;
  error?: string;
}

const MIN_BID_PER_TON = 0.01;
const MIN_AUCTION_TONS = 1;
const MAX_AUCTION_TONS = 1000000;

const auctions = new Map<string, Auction>();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function validateAuctionCreation(request: AuctionCreateRequest): string | null {
  if (!request.farmerId) return 'farmerId is required';
  if (!request.projectId) return 'projectId is required';
  if (!request.tonsOffered || request.tonsOffered <= 0) {
    return 'tonsOffered must be greater than zero';
  }
  if (request.tonsOffered < MIN_AUCTION_TONS) {
    return `tonsOffered must be at least ${MIN_AUCTION_TONS} ton`;
  }
  if (request.tonsOffered > MAX_AUCTION_TONS) {
    return `tonsOffered exceeds maximum of ${MAX_AUCTION_TONS}`;
  }
  if (!request.reservePricePerTon || request.reservePricePerTon <= 0) {
    return 'reservePricePerTon must be greater than zero';
  }
  if (!request.closesAt) {
    return 'closesAt is required';
  }
  const closesAt = new Date(request.closesAt);
  if (isNaN(closesAt.getTime())) return 'invalid closesAt date';
  if (closesAt.getTime() <= Date.now()) return 'closesAt must be in the future';
  return null;
}

function createAuction(request: AuctionCreateRequest): { auction?: Auction; error?: string } {
  const validationError = validateAuctionCreation(request);
  if (validationError) return { error: validationError };

  const auction: Auction = {
    auctionId: generateId('auction'),
    farmerId: request.farmerId,
    projectId: request.projectId,
    tonsOffered: request.tonsOffered,
    reservePricePerTon: request.reservePricePerTon,
    closesAt: new Date(request.closesAt).toISOString(),
    status: 'open',
    bids: [],
  };
  auctions.set(auction.auctionId, auction);
  return { auction };
}

function validateBid(auction: Auction, bid: AuctionBidRequest): string | null {
  if (!auction) return 'auction not found';
  if (auction.status !== 'open') return `auction is not open (current status: ${auction.status})`;
  if (Date.now() > new Date(auction.closesAt).getTime()) return 'auction has closed';
  if (!bid.buyerId) return 'buyerId is required';
  if (!bid.amountPerTon || bid.amountPerTon < MIN_BID_PER_TON) {
    return `amountPerTon must be at least ${MIN_BID_PER_TON}`;
  }
  if (!bid.tons || bid.tons <= 0) return 'tons must be greater than zero';
  if (bid.tons > auction.tonsOffered) {
    return `bid tons cannot exceed tonsOffered (${auction.tonsOffered})`;
  }
  if (bid.amountPerTon < auction.reservePricePerTon) {
    return `amountPerTon must meet the reserve price of ${auction.reservePricePerTon}`;
  }
  return null;
}

function placeBid(auctionId: string, bidRequest: AuctionBidRequest): { auction?: Auction; bid?: AuctionBid; error?: string } {
  const auction = auctions.get(auctionId);
  const validationError = validateBid(auction as Auction, bidRequest);
  if (validationError) return { error: validationError };

  const bid: AuctionBid = {
    bidId: generateId('bid'),
    buyerId: bidRequest.buyerId,
    amountPerTon: bidRequest.amountPerTon,
    tons: bidRequest.tons,
    placedAt: new Date().toISOString(),
  };
  auction!.bids.push(bid);
  return { auction, bid };
}

function selectWinningBid(auction: Auction): AuctionBid | undefined {
  if (auction.bids.length === 0) return undefined;
  return [...auction.bids].sort((a, b) => {
    if (b.amountPerTon !== a.amountPerTon) {
      return b.amountPerTon - a.amountPerTon;
    }
    // Tie breaker: earlier bid wins
    return new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime();
  })[0];
}

function settleAuction(auctionId: string): AuctionSettlement {
  const auction = auctions.get(auctionId);
  if (!auction) return { auctionId, status: 'cancelled', error: 'auction not found' };
  if (auction.status !== 'open') {
    return { auctionId, status: auction.status, error: `auction is not open (current status: ${auction.status})` };
  }
  if (Date.now() < new Date(auction.closesAt).getTime()) {
    return { auctionId, status: auction.status, error: 'auction has not closed yet' };
  }

  const winningBid = selectWinningBid(auction);
  if (!winningBid) {
    auction.status = 'cancelled';
    return { auctionId, status: 'cancelled', error: 'no bids received' };
  }

  auction.status = 'settled';
  return {
    auctionId,
    status: 'settled',
    winningBid,
    totalValue: winningBid.amountPerTon * winningBid.tons,
  };
}
function getEarlySponsors(platformLaunchDate: string): AirdropRecipient[] {
  const launch = new Date(platformLaunchDate);
  const cutoff = new Date(launch);
  cutoff.setMonth(cutoff.getMonth() + 6);

  return mockAdminUsers
    .filter((user) => {
      if (user.status === 'Deleted') return false;
      const joined = new Date(user.joinedAt);
      if (joined < launch || joined > cutoff) return false;
      return user.activityLog.some(
        (entry) => entry.type === 'donation' || entry.type === 'credit_purchase'
      );
    })
    .map((user) => ({
      userId: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      joinedAt: user.joinedAt,
    }));
}

export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    logAudit('admin.airdrop.preview', { status: 'denied' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitInspection = enforceRateLimit(request);
  if (rateLimitInspection) {
    logAudit('admin.airdrop.preview', { status: 'rate_limited', keys: getClientKeys(request) });
    return rateLimitInspection;
  }

  const { searchParams } = new URL(request.url);
  const platformLaunchDate = searchParams.get('platformLaunchDate');
  const creditsPerSponsor = Number(searchParams.get('creditsPerSponsor') ?? 0);

  logAudit('admin.airdrop.preview', {
    status: 'started',
    platformLaunchDate,
    creditsPerSponsor,
  });

  if (!platformLaunchDate || isNaN(new Date(platformLaunchDate).getTime())) {
    logAudit('admin.airdrop.preview', { status: 'invalid_date' });
    return NextResponse.json({ error: 'Invalid or missing platformLaunchDate' }, { status: 400 });
  }

  if (creditsPerSponsor <= 0) {
    logAudit('admin.airdrop.preview', { status: 'invalid_credits' });
    return NextResponse.json(
      { error: 'creditsPerSponsor must be greater than zero' },
      { status: 400 }
    );
  }

  const recipients = getEarlySponsors(platformLaunchDate);
  const cutoff = new Date(platformLaunchDate);
  cutoff.setMonth(cutoff.getMonth() + 6);

  const preview: AirdropPreview = {
    recipients,
    totalCredits: recipients.length * creditsPerSponsor,
    cutoffDate: cutoff.toISOString(),
  };

  logAudit('admin.airdrop.preview', {
    status: 'success',
    recipientCount: recipients.length,
    totalCredits: preview.totalCredits,
  });

  return NextResponse.json(preview);
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    logAudit('admin.airdrop.execute', { status: 'denied' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitInspection = enforceRateLimit(request);
  if (rateLimitInspection) {
    logAudit('admin.airdrop.execute', { status: 'rate_limited', keys: getClientKeys(request) });
    return rateLimitInspection;
  }

  try {
    const body = (await request.json()) as AirdropRequest;
    const { creditsPerSponsor, projectId, platformLaunchDate } = body;

    logAudit('admin.airdrop.execute', {
      status: 'started',
      projectId,
      platformLaunchDate,
      creditsPerSponsor,
    });

    if (!projectId) {
      logAudit('admin.airdrop.execute', { status: 'missing_project_id' });
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    if (!platformLaunchDate || isNaN(new Date(platformLaunchDate).getTime())) {
      logAudit('admin.airdrop.execute', { status: 'invalid_date' });
      return NextResponse.json({ error: 'Invalid or missing platformLaunchDate' }, { status: 400 });
    }

    if (!creditsPerSponsor || creditsPerSponsor <= 0) {
      logAudit('admin.airdrop.execute', { status: 'invalid_credits' });
      return NextResponse.json(
        { error: 'creditsPerSponsor must be greater than zero' },
        { status: 400 }
      );
    }

    const recipients = getEarlySponsors(platformLaunchDate);
    const cutoff = new Date(platformLaunchDate);
    cutoff.setMonth(cutoff.getMonth() + 6);

    const result: AirdropResult = {
      projectId,
      recipients,
      totalCredits: recipients.length * creditsPerSponsor,
      cutoffDate: cutoff.toISOString(),
      status: 'queued',
    };

    logAudit('admin.airdrop.execute', {
      status: 'success',
      projectId,
      recipientCount: recipients.length,
      totalCredits: result.totalCredits,
    });

    return NextResponse.json(result);
  } catch {
    logAudit('admin.airdrop.execute', { status: 'invalid_body' });
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
