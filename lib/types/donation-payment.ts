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
  amount: number; // per-tree amount in USD (sent as USDC)
  treeCount?: number; // number of trees (1–50, default 1)
  walletPublicKey: string;
  network: NetworkType;
  idempotencyKey: string;
}

export interface DonationAllocationBreakdown {
  total: number;
  planting: number;
  buffer: number;
}

export interface BuildDonationTransactionResponse {
  transactionXdr: string;
  networkPassphrase: string;
  allocation: {
    perTree: DonationAllocationBreakdown;
    total: DonationAllocationBreakdown;
    treeCount: number;
  };
}
