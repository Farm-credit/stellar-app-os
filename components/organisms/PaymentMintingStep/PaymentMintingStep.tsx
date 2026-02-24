import type { CreditSelectionState } from '@/lib/types/carbon';
import type { WalletConnection } from '@/lib/types/wallet';

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
  onComplete?: (transactionHash: string) => void;
  onError?: (error: string) => void;
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

export function PaymentMintingStep({
  selection,
  wallet,
  onComplete,
  onError,
}: PaymentMintingProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-semibold mb-4">Transaction Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Project ID:</span>
            <span className="font-medium">{selection?.projectId || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Quantity:</span>
            <span className="font-medium">{selection?.quantity || 0} tonnes</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Total Amount:</span>
            <span className="font-medium">${selection?.calculatedPrice || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
