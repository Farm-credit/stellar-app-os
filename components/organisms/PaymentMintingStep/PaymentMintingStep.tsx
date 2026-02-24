'use client';

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



import * as React from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';

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
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    if (!wallet?.isConnected) {
      onError?.('Wallet not connected');
      return;
    }
    try {
      setIsSubmitting(true);
      const hash = 'TX-' + Math.random().toString(36).slice(2, 10).toUpperCase();
      onComplete?.(hash);
    } catch {
      onError?.('Failed to submit transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4">
        <Text as="h2" variant="h3">
          Review and Pay
        </Text>
      </div>
      <div className="mb-6 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Project</span>
          <span>{selection.projectId ? `Project ${selection.projectId}` : 'Unknown Project'}</span>
        </div>
        <div className="flex justify-between">
          <span>Quantity</span>
          <span>{selection.quantity.toFixed(2)} tons CO₂</span>
        </div>
        <div className="flex justify-between">
          <span>Price per ton</span>
          <span>${'0.00'}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>${(selection.quantity * 0).toFixed(2)}</span>
        </div>
      </div>
      <div className="flex justify-end">
        <Button stellar="primary" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Processing…' : 'Pay & Mint'}
        </Button>
      </div>
    </div>
  );
}
