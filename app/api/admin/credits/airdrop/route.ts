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
    const totalCredits = recipients.length * creditsPerSponsor;

    const result: AirdropResult = {
      totalQueued: recipients.length,
      recipients: recipients.map((recipient) => ({
        walletAddress: recipient.walletAddress,
        status: 'queued' as const,
      })),
    };

    logAudit('admin.airdrop.execute', {
      status: 'success',
      recipientCount: recipients.length,
      totalCredits,
      totalQueued: result.totalQueued,
      projectId,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Airdrop failed';
    logAudit('admin.airdrop.execute', { status: 'error', message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!(await isAdminRequest())) {
    logAudit('admin.farmer_payments.process', { status: 'denied' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitInspection = enforceRateLimit(request);
  if (rateLimitInspection) {
    logAudit('admin.farmer_payments.process', {
      status: 'rate_limited',
      keys: getClientKeys(request),
    });
    return rateLimitInspection;
  }

  try {
    const body = (await request.json()) as {
      payments?: FarmerPaymentRequest[];
      fractionalization?: FractionalizationRequest;
    };
    const payments = body.payments ?? [];
    const fractionalization = body.fractionalization;

    logAudit('admin.farmer_payments.process', {
      status: 'started',
      paymentCount: payments.length,
      hasFractionalization: Boolean(fractionalization),
    });

    if (fractionalization) {
      const result = fractionalizeProject(fractionalization);
      logAudit('admin.fractionalization.process', {
        status: result.status,
        projectId: result.projectId,
        availableUnits: result.availableUnits,
        error: result.error,
      });
      if (result.status === 'failed') {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ fractionalization: result });
    }

    if (!Array.isArray(payments) || payments.length === 0) {
      logAudit('admin.farmer_payments.process', { status: 'no_payments' });
      return NextResponse.json({ error: 'payments must be a non-empty array' }, { status: 400 });
    }

    const results = processFarmerPayments(payments);
    const queued = results.filter((r) => r.status === 'queued').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    logAudit('admin.farmer_payments.process', {
      status: 'success',
      queued,
      failed,
    });

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Farmer payment processing failed';
    logAudit('admin.farmer_payments.process', { status: 'error', message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
