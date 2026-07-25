import type { TransactionStatus } from './payment';
import type { NetworkType } from './wallet';

export type DonationPaymentMethod = 'card' | 'stellar';

/**
 * Asset a donor pays with on the Stellar network. USDC is sent directly to
 * escrow; XLM is converted to USDC on-chain via a strict-receive path payment.
 */
export type DonationAsset = 'USDC' | 'XLM';

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
  amount: number; // per-tree amount in USD (escrow is always credited in USDC)
  treeCount?: number; // number of trees (1–50, default 1)
  walletPublicKey: string;
  network: NetworkType;
  idempotencyKey: string;
  asset?: DonationAsset; // payment asset (default 'USDC'); 'XLM' is converted on-chain
  slippageTolerance?: number; // optional override for XLM conversion slippage (e.g. 0.02 = 2%)
  regionId?: string;
}

export interface DonationAllocationBreakdown {
  total: number;
  planting: number;
  buffer: number;
}

export interface DonationAllocationBreakdown {
  total: number;
  planting: number;
  buffer: number;
}

export interface BuildDonationTransactionResponse {
  transactionXdr: string;
  networkPassphrase: string;
  asset: DonationAsset;
  /**
   * Amount the donor's account is debited, in the payment asset.
   * For USDC this equals the total donation. For XLM it is the `sendMax`
   * ceiling (quote + slippage) — the actual XLM spent may be lower.
   */
  estimatedSourceAmount: string;
  allocation: {
    perTree: DonationAllocationBreakdown;
    total: DonationAllocationBreakdown;
    treeCount: number;
  };
}
