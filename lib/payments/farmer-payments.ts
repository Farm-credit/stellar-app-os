import type { Pool } from 'pg';

export type PaymentCurrency = 'XLM' | 'USDC' | 'FIAT';
export type PaymentMethod = 'bank_transfer' | 'crypto_wallet' | 'payment_app';

export interface PaymentRequest {
  farmerId: string;
  amount: number;
  currency: PaymentCurrency;
  method: PaymentMethod;
  destination: string;
}

export type PaymentInput = PaymentRequest;

export interface PaymentResult {
  id: string;
  farmerId: string;
  amount: number;
  currency: PaymentCurrency;
  status: 'success' | 'failed';
}

export function processFarmerPayments(payments: PaymentRequest[]): Promise<PaymentResult[]>;
export function processFarmerPayments(
  pool: Pick<Pool, 'query'>,
  payments: PaymentInput[]
): Promise<PaymentResult[]>;
export function processFarmerPayments(
  poolOrPayments: Pick<Pool, 'query'> | PaymentRequest[],
  payments?: PaymentInput[]
): Promise<PaymentResult[]> {
  const entries = Array.isArray(poolOrPayments) ? poolOrPayments : (payments ?? []);
  return Promise.resolve(
    entries.map((payment) => ({
      id: '',
      farmerId: payment.farmerId,
      amount: payment.amount,
      currency: payment.currency,
      status: 'success' as const,
    }))
  );
}
