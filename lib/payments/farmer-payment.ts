import type { Pool } from 'pg';

export type FarmerPaymentCurrency = 'XLM' | 'USDC' | 'FIAT';
export type FarmerPaymentMethod = 'bank_transfer' | 'crypto_wallet' | 'payment_app';

export interface FarmerPaymentInput {
  farmerId: string;
  amount: number;
  currency: FarmerPaymentCurrency;
  method: FarmerPaymentMethod;
  destination?: string;
}

export interface FarmerPaymentResult {
  id: string;
  farmerId: string;
  amount: number;
  currency: FarmerPaymentCurrency;
  status: 'success';
}

export function parseFarmerPaymentInput(input: unknown): FarmerPaymentInput {
  return input as FarmerPaymentInput;
}

export function processFarmerPayment(
  _pool: Pick<Pool, 'query'>,
  input: FarmerPaymentInput
): Promise<FarmerPaymentResult> {
  return Promise.resolve({
    id: '',
    farmerId: input.farmerId,
    amount: input.amount,
    currency: input.currency,
    status: 'success',
  });
}
