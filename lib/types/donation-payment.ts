import type { TransactionStatus } from './payment';
import type { NetworkType } from './wallet';

export type DonationPaymentMethod = 'card' | 'stellar';

export interface DonationPaymentState {
  method: DonationPaymentMethod;
  status: TransactionStatus;
  error: string | null;
  transactionId: string | null;
  idempotencyKey: string;
}

export interface StripePaymentIntentRequest {
  amount: number; // in cents
  currency: string;
  donorEmail: string;
  donorName: string;
  isMonthly: boolean;
  idempotencyKey: string;
}

export interface StripePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

export interface BuildDonationTransactionRequest {
  amount: number; // in USD (sent as USDC)
  walletPublicKey: string;
  network: NetworkType;
  idempotencyKey: string;
}

export interface BuildDonationTransactionResponse {
  transactionXdr: string;
  networkPassphrase: string;
}
