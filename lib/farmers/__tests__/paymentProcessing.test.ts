/**
 * Unit tests — Farmer multi-currency payment processing — Issue #1276
 */
import { describe, it, expect } from 'vitest';
import {
  calculatePayoutQuote,
  processFarmerPayout,
  getFarmerPayoutById,
  listFarmerPayouts,
  getSupportedPaymentChannels,
  BASE_EXCHANGE_RATES,
  CHANNEL_FEES_BPS,
  type InitiatePayoutRequest,
} from '../paymentProcessing';

// ── Quote calculation ─────────────────────────────────────────────────────────

describe('calculatePayoutQuote', () => {
  it('returns a valid quote for USDC → NGN via bank transfer', () => {
    const quote = calculatePayoutQuote({
      farmerId: 'farmer-001',
      sourceCurrency: 'USDC',
      sourceAmount: 1000,
      targetCurrency: 'NGN',
      channel: 'bank_transfer',
    });

    expect(quote.quoteId).toMatch(/^quot-/);
    expect(quote.farmerId).toBe('farmer-001');
    expect(quote.sourceCurrency).toBe('USDC');
    expect(quote.targetCurrency).toBe('NGN');
    expect(quote.sourceAmount).toBe(1000);
    expect(quote.exchangeRate).toBeCloseTo(BASE_EXCHANGE_RATES.NGN, 1);
    expect(quote.feeAmountSource).toBeGreaterThan(0);
    expect(quote.feePercentage).toBeCloseTo(CHANNEL_FEES_BPS.bank_transfer / 100, 2);
    expect(quote.netSourceAmount).toBeLessThan(1000);
    expect(quote.estimatedTargetAmount).toBeGreaterThan(0);
    expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('charges lower fees for crypto_wallet than bank_transfer', () => {
    const crypto = calculatePayoutQuote({
      farmerId: 'f1',
      sourceCurrency: 'USDC',
      sourceAmount: 500,
      targetCurrency: 'XLM',
      channel: 'crypto_wallet',
    });
    const bank = calculatePayoutQuote({
      farmerId: 'f1',
      sourceCurrency: 'USDC',
      sourceAmount: 500,
      targetCurrency: 'USD',
      channel: 'bank_transfer',
    });

    expect(crypto.feeAmountSource).toBeLessThan(bank.feeAmountSource);
  });

  it('calculates USDC → USDC with fee but rate = 1', () => {
    const quote = calculatePayoutQuote({
      farmerId: 'f2',
      sourceCurrency: 'USDC',
      sourceAmount: 200,
      targetCurrency: 'USDC',
      channel: 'crypto_wallet',
    });

    expect(quote.exchangeRate).toBe(1);
    expect(quote.estimatedTargetAmount).toBeLessThan(200);
  });

  it('calculates XLM source correctly by converting through USD base', () => {
    const quote = calculatePayoutQuote({
      farmerId: 'f3',
      sourceCurrency: 'XLM',
      sourceAmount: 100,
      targetCurrency: 'USD',
      channel: 'payment_app',
    });

    // 100 XLM at ~$0.12/XLM ≈ $12 USD minus fees
    expect(quote.estimatedTargetAmount).toBeGreaterThan(0);
    expect(quote.estimatedTargetAmount).toBeLessThan(100);
  });

  it('throws for zero or negative source amount', () => {
    expect(() =>
      calculatePayoutQuote({
        farmerId: 'f4',
        sourceCurrency: 'USD',
        sourceAmount: 0,
        targetCurrency: 'NGN',
        channel: 'bank_transfer',
      })
    ).toThrow('greater than zero');
  });
});

// ── Payout processing ─────────────────────────────────────────────────────────

describe('processFarmerPayout', () => {
  const cryptoRequest: InitiatePayoutRequest = {
    farmerId: 'farmer-test-01',
    farmerName: 'Test Farmer',
    sourceCurrency: 'USDC',
    sourceAmount: 500,
    targetCurrency: 'XLM',
    destination: {
      channel: 'crypto_wallet',
      crypto: {
        stellarAddress: 'GBWMQ5A63V525J4QY62B75S3H7W7K7R5QY62B75S3H7W7K7R5QY67X2L',
        network: 'mainnet',
      },
    },
    narration: 'Test crypto payout',
  };

  it('processes a crypto wallet payout and returns a completed record', () => {
    const record = processFarmerPayout(cryptoRequest);

    expect(record.id).toMatch(/^pay-/);
    expect(record.farmerId).toBe('farmer-test-01');
    expect(record.status).toBe('completed');
    expect(record.channel).toBe('crypto_wallet');
    expect(record.transactionHash).toBeDefined();
    expect(record.destinationSummary).toContain('Stellar');
    expect(record.targetAmount).toBeGreaterThan(0);
  });

  it('processes a bank transfer payout', () => {
    const req: InitiatePayoutRequest = {
      farmerId: 'farmer-test-02',
      farmerName: 'Bank Farmer',
      sourceCurrency: 'USDC',
      sourceAmount: 1000,
      targetCurrency: 'NGN',
      destination: {
        channel: 'bank_transfer',
        bank: {
          rail: 'nuban',
          accountHolderName: 'Bank Farmer',
          accountNumber: '0123456789',
          bankName: 'First Bank Nigeria',
          bankCode: '011',
          country: 'Nigeria',
        },
      },
    };

    const record = processFarmerPayout(req);

    expect(record.status).toBe('completed');
    expect(record.channel).toBe('bank_transfer');
    expect(record.bankReference).toMatch(/^BANK-NUBAN-/);
    expect(record.destinationSummary).toContain('First Bank Nigeria');
  });

  it('processes a payment app (M-Pesa) payout', () => {
    const req: InitiatePayoutRequest = {
      farmerId: 'farmer-test-03',
      farmerName: 'Mpesa Farmer',
      sourceCurrency: 'USDC',
      sourceAmount: 300,
      targetCurrency: 'KES',
      destination: {
        channel: 'payment_app',
        paymentApp: {
          provider: 'm_pesa',
          accountIdentifier: '+254712345678',
          recipientName: 'Mpesa Farmer',
        },
      },
    };

    const record = processFarmerPayout(req);

    expect(record.status).toBe('completed');
    expect(record.channel).toBe('payment_app');
    expect(record.paymentAppReceipt).toMatch(/^APP-M_PESA-/);
    expect(record.destinationSummary).toContain('+254712345678');
  });

  it('honours idempotency key — returns same record on duplicate call', () => {
    const req: InitiatePayoutRequest = {
      ...cryptoRequest,
      farmerId: 'farmer-idempotent',
      idempotencyKey: 'idmp-key-abc-123',
    };

    const first = processFarmerPayout(req);
    const second = processFarmerPayout(req);

    expect(first.id).toBe(second.id);
  });

  it('throws when crypto wallet address is missing', () => {
    const req: InitiatePayoutRequest = {
      ...cryptoRequest,
      destination: {
        channel: 'crypto_wallet',
        crypto: { stellarAddress: '' },
      },
    };

    expect(() => processFarmerPayout(req)).toThrow('Stellar public address');
  });

  it('throws when bank transfer is missing account number', () => {
    const req: InitiatePayoutRequest = {
      farmerId: 'f',
      farmerName: 'F',
      sourceCurrency: 'USDC',
      sourceAmount: 100,
      targetCurrency: 'NGN',
      destination: {
        channel: 'bank_transfer',
        bank: {
          rail: 'nuban',
          accountHolderName: 'F',
          accountNumber: '',
          bankName: 'Bank',
          country: 'Nigeria',
        },
      },
    };

    expect(() => processFarmerPayout(req)).toThrow('Account number');
  });
});

// ── Retrieval ─────────────────────────────────────────────────────────────────

describe('getFarmerPayoutById', () => {
  it('returns undefined for a non-existent ID', () => {
    expect(getFarmerPayoutById('does-not-exist')).toBeUndefined();
  });

  it('returns the seeded payout pay-001', () => {
    const record = getFarmerPayoutById('pay-001');
    expect(record).toBeDefined();
    expect(record?.farmerId).toBe('farmer-kwame');
  });
});

describe('listFarmerPayouts', () => {
  it('returns all payouts when no filters applied', () => {
    const list = listFarmerPayouts();
    expect(list.length).toBeGreaterThanOrEqual(3); // at least the 3 seeds
  });

  it('filters by farmerId', () => {
    const list = listFarmerPayouts({ farmerId: 'farmer-kwame' });
    expect(list.every((p) => p.farmerId === 'farmer-kwame')).toBe(true);
  });

  it('filters by status', () => {
    const list = listFarmerPayouts({ status: 'completed' });
    expect(list.every((p) => p.status === 'completed')).toBe(true);
  });

  it('filters by currency', () => {
    const list = listFarmerPayouts({ currency: 'GHS' });
    expect(
      list.every((p) => p.targetCurrency === 'GHS' || p.sourceCurrency === 'GHS')
    ).toBe(true);
  });

  it('respects limit', () => {
    const list = listFarmerPayouts({ limit: 2 });
    expect(list.length).toBeLessThanOrEqual(2);
  });

  it('sorts descending by createdAt', () => {
    const list = listFarmerPayouts();
    for (let i = 1; i < list.length; i++) {
      expect(new Date(list[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(list[i].createdAt).getTime()
      );
    }
  });
});

// ── Channel catalogue ─────────────────────────────────────────────────────────

describe('getSupportedPaymentChannels', () => {
  it('returns exactly three channels', () => {
    const channels = getSupportedPaymentChannels();
    expect(channels).toHaveLength(3);
  });

  it('includes crypto_wallet, bank_transfer, and payment_app', () => {
    const ids = getSupportedPaymentChannels().map((c) => c.channel);
    expect(ids).toContain('crypto_wallet');
    expect(ids).toContain('bank_transfer');
    expect(ids).toContain('payment_app');
  });

  it('crypto_wallet has the lowest fee', () => {
    const channels = getSupportedPaymentChannels();
    const crypto = channels.find((c) => c.channel === 'crypto_wallet')!;
    const bank = channels.find((c) => c.channel === 'bank_transfer')!;
    expect(crypto.feeBasisPoints).toBeLessThan(bank.feeBasisPoints);
  });
});
