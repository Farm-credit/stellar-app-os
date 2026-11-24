export type FarmerPaymentCurrency = 'XLM' | 'USDC' | 'FIAT';
export type FarmerPaymentMethod = 'bank_transfer' | 'crypto_wallet' | 'payment_app';

export interface FarmerPaymentRequest {
  farmerId: string;
  amount: number;
  currency: FarmerPaymentCurrency;
  method: FarmerPaymentMethod;
  destination?: string;
}

export interface FarmerPaymentResult {
  id: string;
  status: 'success';
}

export function processFarmerPayment(_payment: FarmerPaymentRequest): Promise<FarmerPaymentResult> {
  return Promise.resolve({ id: '', status: 'success' });
}
