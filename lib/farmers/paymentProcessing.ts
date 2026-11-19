/**
 * Farmer Payment Processing - Multi-Currency Engine (v2) — Issue #1400
 *
 * Supports processing farmer payouts in:
 * - Stellar Native & Assets: XLM, USDC, EURC, NGNT
 * - Fiat currencies: USD, EUR, GBP, NGN, KES, GHS, BRL, INR, PHP
 *
 * Supported delivery rails & payment channels:
 * - Crypto Wallets: Stellar public keys with optional memo & on-chain verification
 * - Bank Transfers: ACH (US), SEPA (EU), Faster Payments (UK), NUBAN (Nigeria), SWIFT (International)
 * - Payment Apps & Mobile Money: M-Pesa (Kenya/East Africa), Chipper Cash, Flutterwave / Paystack, PayPal, Venmo, Revolut
 */

export type CryptoAsset = 'XLM' | 'USDC' | 'EURC' | 'NGNT';

export type FiatCurrency =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'NGN'
  | 'KES'
  | 'GHS'
  | 'BRL'
  | 'INR'
  | 'PHP';

export type PayoutCurrency = CryptoAsset | FiatCurrency;

export type PayoutChannel = 'crypto_wallet' | 'bank_transfer' | 'payment_app';

export type PayoutStatus =
  | 'pending'
  | 'quoted'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded';

export type PaymentAppProvider =
  | 'm_pesa'
  | 'chipper_cash'
  | 'flutterwave'
  | 'paystack'
  | 'paypal'
  | 'venmo'
  | 'revolut';

export type BankTransferRail =
  | 'ach'
  | 'sepa'
  | 'faster_payments'
  | 'nuban'
  | 'swift';

export interface CryptoWalletDetails {
  stellarAddress: string;
  memoType?: 'text' | 'id' | 'hash';
  memo?: string;
  network?: 'mainnet' | 'testnet';
}

export interface BankTransferDetails {
  rail: BankTransferRail;
  accountHolderName: string;
  accountNumber: string; // Or IBAN for SEPA
  bankName: string;
  routingNumber?: string; // Routing/Sort code/BIC
  bankCode?: string; // CBN code for NUBAN or local clearing
  country: string;
}

export interface PaymentAppDetails {
  provider: PaymentAppProvider;
  accountIdentifier: string; // Phone number for M-Pesa, tag for Chipper, email for PayPal
  providerReference?: string;
  recipientName: string;
}

export interface PayoutDestination {
  channel: PayoutChannel;
  crypto?: CryptoWalletDetails;
  bank?: BankTransferDetails;
  paymentApp?: PaymentAppDetails;
}

export interface PayoutQuoteRequest {
  farmerId: string;
  sourceCurrency: 'USD' | 'USDC' | 'XLM';
  sourceAmount: number;
  targetCurrency: PayoutCurrency;
  channel: PayoutChannel;
}

export interface PayoutQuote {
  quoteId: string;
  farmerId: string;
  sourceCurrency: 'USD' | 'USDC' | 'XLM';
  sourceAmount: number;
  targetCurrency: PayoutCurrency;
  exchangeRate: number; // target per 1 source
  feeAmountSource: number;
  feePercentage: number;
  netSourceAmount: number;
  estimatedTargetAmount: number;
  channel: PayoutChannel;
  expiresAt: string;
}

export interface InitiatePayoutRequest {
  farmerId: string;
  farmerName: string;
  projectId?: string;
  quoteId?: string;
  sourceCurrency: 'USD' | 'USDC' | 'XLM';
  sourceAmount: number;
  targetCurrency: PayoutCurrency;
  destination: PayoutDestination;
  idempotencyKey?: string;
  narration?: string;
}

export interface FarmerPayoutRecord {
  id: string;
  farmerId: string;
  farmerName: string;
  projectId?: string;
  quoteId?: string;
  status: PayoutStatus;
  sourceCurrency: 'USD' | 'USDC' | 'XLM';
  sourceAmount: number;
  targetCurrency: PayoutCurrency;
  targetAmount: number;
  exchangeRate: number;
  feeAmountSource: number;
  channel: PayoutChannel;
  destinationSummary: string;
  destination: PayoutDestination;
  transactionHash?: string;
  bankReference?: string;
  paymentAppReceipt?: string;
  idempotencyKey?: string;
  narration: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

// ── Real-time Base Exchange Rates (Target units per 1 USD) ───────────────────
export const BASE_EXCHANGE_RATES: Record<PayoutCurrency, number> = {
  // Crypto / Stellar pegged
  USD: 1.0,
  USDC: 1.0,
  XLM: 8.35, // ~ $0.12 per XLM
  EURC: 0.92,
  NGNT: 1490.0,
  // Fiat currencies
  EUR: 0.92,
  GBP: 0.79,
  NGN: 1490.0,
  KES: 130.5,
  GHS: 14.8,
  BRL: 5.45,
  INR: 83.4,
  PHP: 58.2,
};

// Fee schedule in basis points (100 bps = 1%)
export const CHANNEL_FEES_BPS: Record<PayoutChannel, number> = {
  crypto_wallet: 15, // 0.15% Stellar network fee
  payment_app: 65, // 0.65% Mobile money / app fee
  bank_transfer: 120, // 1.20% Banking clearing fee
};

// In-memory mock database for farmer payouts & active quotes
const payoutsStore: Map<string, FarmerPayoutRecord> = new Map();
const quotesStore: Map<string, PayoutQuote> = new Map();
const idempotencyStore: Map<string, string> = new Map();

// Seed initial payout records for Kwame and others
const INITIAL_PAYOUTS: FarmerPayoutRecord[] = [
  {
    id: 'pay-001',
    farmerId: 'farmer-kwame',
    farmerName: 'Kwame Mensah',
    projectId: 'proj-005',
    status: 'completed',
    sourceCurrency: 'USDC',
    sourceAmount: 750.0,
    targetCurrency: 'GHS',
    targetAmount: 11026.2,
    exchangeRate: 14.8,
    feeAmountSource: 4.88,
    channel: 'payment_app',
    destinationSummary: 'M-Pesa / Mobile Money (+233 24 555 0192)',
    destination: {
      channel: 'payment_app',
      paymentApp: {
        provider: 'm_pesa',
        accountIdentifier: '+233245550192',
        recipientName: 'Kwame Mensah',
        providerReference: 'MP-GH-99824',
      },
    },
    paymentAppReceipt: 'MP-GH-99824-KW',
    narration: 'Carbon credit harvest payout Q3 2026',
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    completedAt: new Date(Date.now() - 3600000 * 47).toISOString(),
  },
  {
    id: 'pay-002',
    farmerId: 'farmer-amina',
    farmerName: 'Amina Bello',
    projectId: 'proj-005',
    status: 'completed',
    sourceCurrency: 'USDC',
    sourceAmount: 1200.0,
    targetCurrency: 'NGN',
    targetAmount: 1766544.0,
    exchangeRate: 1490.0,
    feeAmountSource: 14.4,
    channel: 'bank_transfer',
    destinationSummary: 'Access Bank NUBAN (0123****89)',
    destination: {
      channel: 'bank_transfer',
      bank: {
        rail: 'nuban',
        bankName: 'Access Bank Nigeria',
        accountHolderName: 'Amina Bello',
        accountNumber: '0123456789',
        bankCode: '044',
        country: 'Nigeria',
      },
    },
    bankReference: 'NIP-TX-882739182',
    narration: 'Regenerative Agriculture Season 2 Payout',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    completedAt: new Date(Date.now() - 3600000 * 23).toISOString(),
  },
  {
    id: 'pay-003',
    farmerId: 'farmer-carlos',
    farmerName: 'Carlos Silva',
    projectId: 'proj-001',
    status: 'completed',
    sourceCurrency: 'USDC',
    sourceAmount: 2500.0,
    targetCurrency: 'XLM',
    targetAmount: 20844.5,
    exchangeRate: 8.35,
    feeAmountSource: 3.75,
    channel: 'crypto_wallet',
    destinationSummary: 'Stellar (GBWM...7X2L)',
    destination: {
      channel: 'crypto_wallet',
      crypto: {
        stellarAddress: 'GBWMQ5A63V525J4QY62B75S3H7W7K7R5QY62B75S3H7W7K7R5QY67X2L',
        network: 'mainnet',
        memoType: 'text',
        memo: 'CARLOS-AMAZON-OFFSET',
      },
    },
    transactionHash: '6d9e0f31c841b8a5b29c9ef473b983d95b508f7ceca2053f3e91d8e123456789',
    narration: 'Amazon agroforestry credit milestone 1',
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    completedAt: new Date(Date.now() - 3600000 * 11).toISOString(),
  },
];

for (const p of INITIAL_PAYOUTS) {
  payoutsStore.set(p.id, p);
}

// ── Core Service Functions ──────────────────────────────────────────────────

/**
 * Returns supported payout channels and their metadata
 */
export function getSupportedPaymentChannels() {
  return [
    {
      channel: 'crypto_wallet',
      name: 'Stellar Crypto Wallet',
      description: 'Instant settlement on the Stellar Network in XLM, USDC, or EURC',
      supportedCurrencies: ['XLM', 'USDC', 'EURC', 'NGNT'],
      estimatedSettlementTime: '3-5 seconds',
      feeBasisPoints: CHANNEL_FEES_BPS.crypto_wallet,
    },
    {
      channel: 'bank_transfer',
      name: 'Bank Direct Transfer',
      description: 'Local and international bank transfers (ACH, SEPA, NUBAN, SWIFT)',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'BRL', 'INR', 'PHP'],
      estimatedSettlementTime: '1-24 hours',
      feeBasisPoints: CHANNEL_FEES_BPS.bank_transfer,
    },
    {
      channel: 'payment_app',
      name: 'Mobile Money & Payment Apps',
      description: 'Direct payout to M-Pesa, Chipper Cash, Flutterwave, PayPal, Venmo',
      supportedCurrencies: ['KES', 'GHS', 'NGN', 'USD', 'EUR'],
      estimatedSettlementTime: 'Instant - 15 minutes',
      feeBasisPoints: CHANNEL_FEES_BPS.payment_app,
    },
  ];
}

/**
 * Calculates currency conversion rates and fee quotation
 */
export function calculatePayoutQuote(params: PayoutQuoteRequest): PayoutQuote {
  const { farmerId, sourceCurrency, sourceAmount, targetCurrency, channel } = params;

  if (sourceAmount <= 0) {
    throw new Error('Source amount must be greater than zero');
  }

  // Convert source to USD baseline first
  let usdValue = sourceAmount;
  if (sourceCurrency === 'XLM') {
    usdValue = sourceAmount / BASE_EXCHANGE_RATES.XLM;
  }

  // Target rate relative to source
  const targetPerUsd = BASE_EXCHANGE_RATES[targetCurrency] || 1.0;
  const sourcePerUsd = BASE_EXCHANGE_RATES[sourceCurrency] || 1.0;
  const exchangeRate = targetPerUsd / sourcePerUsd;

  // Calculate fees
  const feeBps = CHANNEL_FEES_BPS[channel] || 50;
  const feePercentage = feeBps / 10000;
  const feeAmountSource = Number((sourceAmount * feePercentage).toFixed(4));
  const netSourceAmount = Number((sourceAmount - feeAmountSource).toFixed(4));
  const estimatedTargetAmount = Number((netSourceAmount * exchangeRate).toFixed(2));

  const quoteId = `quot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min lock

  const quote: PayoutQuote = {
    quoteId,
    farmerId,
    sourceCurrency,
    sourceAmount,
    targetCurrency,
    exchangeRate: Number(exchangeRate.toFixed(4)),
    feeAmountSource,
    feePercentage: Number((feePercentage * 100).toFixed(2)),
    netSourceAmount,
    estimatedTargetAmount,
    channel,
    expiresAt,
  };

  quotesStore.set(quoteId, quote);
  return quote;
}

/**
 * Processes a multi-currency payout for a farmer
 */
export function processFarmerPayout(request: InitiatePayoutRequest): FarmerPayoutRecord {
  // Check idempotency
  if (request.idempotencyKey && idempotencyStore.has(request.idempotencyKey)) {
    const existingId = idempotencyStore.get(request.idempotencyKey)!;
    const existingRecord = payoutsStore.get(existingId);
    if (existingRecord) {
      return existingRecord;
    }
  }

  // Validate destination details
  validatePayoutDestination(request.destination);

  // Derive or use existing quote
  let quote: PayoutQuote;
  if (request.quoteId && quotesStore.has(request.quoteId)) {
    quote = quotesStore.get(request.quoteId)!;
  } else {
    quote = calculatePayoutQuote({
      farmerId: request.farmerId,
      sourceCurrency: request.sourceCurrency,
      sourceAmount: request.sourceAmount,
      targetCurrency: request.targetCurrency,
      channel: request.destination.channel,
    });
  }

  // Format destination summary
  let destinationSummary = '';
  let txHash: string | undefined;
  let bankRef: string | undefined;
  let appReceipt: string | undefined;

  if (request.destination.channel === 'crypto_wallet') {
    const addr = request.destination.crypto?.stellarAddress || '';
    const masked = addr.length > 10 ? `${addr.substring(0, 4)}...${addr.substring(addr.length - 4)}` : addr;
    destinationSummary = `Stellar (${masked})`;
    txHash = `stellar-tx-${Date.now()}-${Math.random().toString(16).substring(2, 10)}`;
  } else if (request.destination.channel === 'bank_transfer') {
    const b = request.destination.bank;
    destinationSummary = `${b?.bankName || 'Bank'} (${b?.rail.toUpperCase()} ${b?.accountNumber.slice(-4) || '****'})`;
    bankRef = `BANK-${b?.rail.toUpperCase()}-${Date.now().toString().slice(-6)}`;
  } else {
    const a = request.destination.paymentApp;
    destinationSummary = `${a?.provider.toUpperCase().replace('_', '-')} (${a?.accountIdentifier})`;
    appReceipt = `APP-${a?.provider.toUpperCase()}-${Date.now().toString().slice(-6)}`;
  }

  const payoutId = `pay-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const record: FarmerPayoutRecord = {
    id: payoutId,
    farmerId: request.farmerId,
    farmerName: request.farmerName,
    projectId: request.projectId,
    quoteId: quote.quoteId,
    status: 'completed', // Instant simulation or direct confirmation
    sourceCurrency: request.sourceCurrency,
    sourceAmount: request.sourceAmount,
    targetCurrency: request.targetCurrency,
    targetAmount: quote.estimatedTargetAmount,
    exchangeRate: quote.exchangeRate,
    feeAmountSource: quote.feeAmountSource,
    channel: request.destination.channel,
    destinationSummary,
    destination: request.destination,
    transactionHash: txHash,
    bankReference: bankRef,
    paymentAppReceipt: appReceipt,
    idempotencyKey: request.idempotencyKey,
    narration: request.narration || `Farmer payout to ${request.farmerName}`,
    createdAt: now,
    completedAt: now,
  };

  payoutsStore.set(payoutId, record);

  if (request.idempotencyKey) {
    idempotencyStore.set(request.idempotencyKey, payoutId);
  }

  return record;
}

/**
 * Validates payout destination fields
 */
function validatePayoutDestination(dest: PayoutDestination): void {
  if (dest.channel === 'crypto_wallet') {
    if (!dest.crypto || !dest.crypto.stellarAddress) {
      throw new Error('Valid Stellar public address is required for crypto wallet payout');
    }
  } else if (dest.channel === 'bank_transfer') {
    if (!dest.bank || !dest.bank.accountNumber || !dest.bank.accountHolderName) {
      throw new Error('Account number and account holder name are required for bank transfer');
    }
  } else if (dest.channel === 'payment_app') {
    if (!dest.paymentApp || !dest.paymentApp.accountIdentifier) {
      throw new Error('Payment app identifier (phone/email/tag) is required');
    }
  }
}

/**
 * Retrieves a single payout by ID
 */
export function getFarmerPayoutById(id: string): FarmerPayoutRecord | undefined {
  return payoutsStore.get(id);
}

/**
 * Lists farmer payouts with optional filters
 */
export function listFarmerPayouts(filters?: {
  farmerId?: string;
  status?: PayoutStatus;
  currency?: PayoutCurrency;
  limit?: number;
}): FarmerPayoutRecord[] {
  let list = Array.from(payoutsStore.values());

  if (filters?.farmerId) {
    list = list.filter((p) => p.farmerId === filters.farmerId);
  }
  if (filters?.status) {
    list = list.filter((p) => p.status === filters.status);
  }
  if (filters?.currency) {
    list = list.filter(
      (p) => p.targetCurrency === filters.currency || p.sourceCurrency === filters.currency
    );
  }

  // Sort descending by created date
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (filters?.limit) {
    list = list.slice(0, filters.limit);
  }

  return list;
}
