'use client';

import { useState, useCallback, useRef } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import { signTransactionWithFreighter, signTransactionWithAlbedo } from '@/lib/stellar/signing';
import { submitTransaction } from '@/lib/stellar/transaction';
import { showToast } from '@/lib/toast';
import type { BulkPurchaseOrder, BulkPurchaseResult, CorporateMetadata } from '@/lib/types/carbon';

export type BulkPurchaseStatus =
  | 'idle'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'success'
  | 'error';

export interface BulkPurchaseState {
  status: BulkPurchaseStatus;
  error: string | null;
  transactionHash: string | null;
  buildResult: BulkPurchaseResult | null;
}

export function useBulkPurchase() {
  const { wallet } = useWalletContext();
  const isProcessingRef = useRef(false);

  const [state, setState] = useState<BulkPurchaseState>({
    status: 'idle',
    error: null,
    transactionHash: null,
    buildResult: null,
  });

  const reset = useCallback(() => {
    setState({ status: 'idle', error: null, transactionHash: null, buildResult: null });
  }, []);

  const submit = useCallback(
    async (
      projectId: string,
      quantity: number,
      totalPrice: number,
      metadata?: CorporateMetadata
    ) => {
      if (isProcessingRef.current || !wallet) return;
      isProcessingRef.current = true;

      try {
        // 1. Build transaction via API
        setState((prev) => ({ ...prev, status: 'building', error: null }));

        const order: BulkPurchaseOrder = {
          projectId,
          quantity,
          totalPrice,
          buyerPublicKey: wallet.publicKey,
          network: wallet.network,
          metadata,
        };

        const buildRes = await fetch('/api/credits/bulk-purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(order),
        });

        if (!buildRes.ok) {
          const { error } = (await buildRes.json()) as { error: string };
          throw new Error(error ?? 'Failed to build transaction');
        }

        const buildResult = (await buildRes.json()) as BulkPurchaseResult;
        setState((prev) => ({ ...prev, status: 'signing', buildResult }));

        // 2. Sign with connected wallet
        let signedXdr: string;
        if (wallet.type === 'freighter') {
          signedXdr = await signTransactionWithFreighter(
            buildResult.transactionXdr,
            buildResult.networkPassphrase
          );
        } else if (wallet.type === 'albedo') {
          signedXdr = await signTransactionWithAlbedo(buildResult.transactionXdr, wallet.network);
        } else {
          throw new Error('Custodial signing not supported for bulk purchases');
        }

        // 3. Submit to Stellar network
        setState((prev) => ({ ...prev, status: 'submitting' }));
        const txHash = await submitTransaction(signedXdr, wallet.network);

        setState((prev) => ({ ...prev, status: 'success', transactionHash: txHash }));
        showToast('Bulk purchase submitted successfully!', 'success');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Bulk purchase failed';
        setState((prev) => ({ ...prev, status: 'error', error: message }));
        showToast(message, 'error');
      } finally {
        isProcessingRef.current = false;
      }
    },
    [wallet]
  );

  const isProcessing = ['building', 'signing', 'submitting'].includes(state.status);

  return { state, submit, reset, isProcessing, wallet };
}
