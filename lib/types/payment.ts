import type { CreditSelectionState } from './carbon';
import type { WalletConnection } from './wallet';

export type TransactionStatus =
  | 'idle'
  | 'preparing'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'error';

export interface PaymentState {
  selection: CreditSelectionState;
  wallet: WalletConnection | null;
  status: TransactionStatus;
  transactionHash: string | null;
  error: string | null;
  idempotencyKey: string | null;
}

export interface TransactionPreview {
  projectName: string;
  quantity: number;
  pricePerTon: number;
  totalAmount: number;
  paymentAsset: string;
  recipientAddress: string;
}

export interface PaymentMintingProps {
  selection: CreditSelectionState;
  wallet: WalletConnection | null;
  onComplete?: () => void;
  onError?: () => void;
}

export interface BuildTransactionRequest {
  selection: CreditSelectionState;
  walletPublicKey: string;
  network: 'testnet' | 'mainnet';
  idempotencyKey: string;
}

export interface BuildTransactionResponse {
  transactionXdr: string;
  networkPassphrase: string;
}
