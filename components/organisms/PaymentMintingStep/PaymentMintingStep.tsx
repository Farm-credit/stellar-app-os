'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/molecules/Card';
import { useWalletContext } from '@/contexts/WalletContext';
import { signTransactionWithFreighter, signTransactionWithAlbedo } from '@/lib/stellar/signing';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import type { PaymentMintingProps, TransactionStatus } from '@/lib/types/payment';

export function PaymentMintingStep({
  selection,
  wallet,
  onComplete,
  onError,
}: PaymentMintingProps) {
  const { refreshBalance } = useWalletContext();
  const [status, setStatus] = useState<TransactionStatus>('idle');
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedProject = mockCarbonProjects.find((p) => p.id === selection.projectId);

  const generateIdempotencyKey = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }, []);

  const handleSignTransaction = useCallback(async () => {
    if (!wallet || !selection.projectId || selection.quantity <= 0) {
      setError('Invalid selection or wallet not connected');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatus('preparing');

    try {
      const idempotencyKey = generateIdempotencyKey();

      setStatus('preparing');
      const buildResponse = await fetch('/api/transaction/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selection,
          walletPublicKey: wallet.publicKey,
          network: wallet.network,
          idempotencyKey,
        }),
      });

      if (!buildResponse.ok) {
        const errorData = (await buildResponse.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to build transaction');
      }

      const { transactionXdr, networkPassphrase } = (await buildResponse.json()) as {
        transactionXdr: string;
        networkPassphrase: string;
      };

      setStatus('signing');
      let signedXdr: string;

      if (wallet.type === 'freighter') {
        signedXdr = await signTransactionWithFreighter(transactionXdr, networkPassphrase);
      } else if (wallet.type === 'albedo') {
        signedXdr = await signTransactionWithAlbedo(transactionXdr, wallet.network);
      } else {
        throw new Error('Unsupported wallet type');
      }

      setStatus('submitting');
      const submitResponse = await fetch('/api/transaction/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransactionXdr: signedXdr,
          network: wallet.network,
        }),
      });

      if (!submitResponse.ok) {
        const errorData = (await submitResponse.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to submit transaction');
      }

      const { transactionHash: hash } = (await submitResponse.json()) as {
        transactionHash: string;
      };

      setTransactionHash(hash);
      setStatus('confirming');

      await new Promise((resolve) => setTimeout(resolve, 2000));

      setStatus('success');
      await refreshBalance();

      if (onComplete) {
        onComplete(hash);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      setError(errorMessage);
      setStatus('error');
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [selection, wallet, generateIdempotencyKey, refreshBalance, onComplete, onError]);

  const canProceed =
    wallet?.isConnected &&
    selection.projectId &&
    selection.quantity > 0 &&
    selection.calculatedPrice > 0 &&
    parseFloat(wallet.balance.usdc) >= selection.calculatedPrice;

  const hasInsufficientBalance =
    wallet?.isConnected &&
    selection.calculatedPrice > 0 &&
    parseFloat(wallet.balance.usdc) < selection.calculatedPrice;

  // Show loading state while redirecting to confirmation page
  if (status === 'success' && transactionHash) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 border-4 border-stellar-green border-t-transparent rounded-full animate-spin" />
          </div>
          <Text variant="h3" as="h2" className="mb-2">
            Transaction Successful!
          </Text>
          <Text variant="muted" as="p">
            Redirecting to confirmation page...
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Text variant="h3" as="h2" className="mb-2">
          Review & Confirm Payment
        </Text>
        <Text variant="muted" as="p">
          Review your transaction details before signing.
        </Text>
      </div>

      {error && status === 'error' && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4" role="alert">
          <Text variant="small" as="p" className="text-destructive font-semibold mb-1">
            Transaction Failed
          </Text>
          <Text variant="small" as="p" className="text-destructive">
            {error}
          </Text>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setError(null);
              setStatus('idle');
            }}
          >
            Try Again
          </Button>
        </div>
      )}

      {hasInsufficientBalance && (
        <div
          className="rounded-lg border border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 p-4"
          role="alert"
        >
          <Text
            variant="small"
            as="p"
            className="text-yellow-800 dark:text-yellow-200 font-semibold mb-1"
          >
            Insufficient Balance
          </Text>
          <Text variant="small" as="p" className="text-yellow-700 dark:text-yellow-300">
            You need {selection.calculatedPrice.toFixed(2)} USDC but only have{' '}
            {parseFloat(wallet?.balance.usdc || '0').toFixed(2)} USDC.
          </Text>
        </div>
      )}

      {selectedProject && (
        <Card>
          <CardHeader>
            <CardTitle>Transaction Preview</CardTitle>
            <CardDescription>Review the details before signing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Text variant="small" as="span" className="text-muted-foreground">
                  Project
                </Text>
                <Text variant="small" as="span" className="font-semibold">
                  {selectedProject.name}
                </Text>
              </div>
              <div className="flex items-center justify-between">
                <Text variant="small" as="span" className="text-muted-foreground">
                  Quantity
                </Text>
                <Text variant="small" as="span" className="font-semibold">
                  {selection.quantity.toFixed(2)} tons CO₂
                </Text>
              </div>
              <div className="flex items-center justify-between">
                <Text variant="small" as="span" className="text-muted-foreground">
                  Price per Ton
                </Text>
                <Text variant="small" as="span" className="font-semibold">
                  ${selectedProject.pricePerTon.toFixed(2)}
                </Text>
              </div>
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between">
                  <Text variant="h4" as="span" className="font-semibold">
                    Total Amount
                  </Text>
                  <Text variant="h4" as="span" className="font-bold text-stellar-blue">
                    ${selection.calculatedPrice.toFixed(2)} USDC
                  </Text>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {status !== 'idle' && status !== 'error' && (
          <div className="rounded-lg border border-stellar-blue/30 bg-stellar-blue/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {status === 'preparing' && (
                  <div className="h-5 w-5 border-2 border-stellar-blue border-t-transparent rounded-full animate-spin" />
                )}
                {status === 'signing' && (
                  <div className="h-5 w-5 border-2 border-stellar-blue border-t-transparent rounded-full animate-spin" />
                )}
                {status === 'submitting' && (
                  <div className="h-5 w-5 border-2 border-stellar-blue border-t-transparent rounded-full animate-spin" />
                )}
                {status === 'confirming' && (
                  <div className="h-5 w-5 border-2 border-stellar-blue border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              <div>
                <Text variant="small" as="p" className="font-semibold">
                  {status === 'preparing' && 'Preparing transaction...'}
                  {status === 'signing' && 'Please sign the transaction in your wallet'}
                  {status === 'submitting' && 'Submitting transaction...'}
                  {status === 'confirming' && 'Confirming on blockchain...'}
                </Text>
                <Text variant="muted" as="p" className="text-xs">
                  {status === 'signing' &&
                    'Check your wallet extension or popup to approve the transaction'}
                </Text>
              </div>
            </div>
          </div>
        )}

        <Button
          stellar="primary"
          size="lg"
          className="w-full"
          onClick={handleSignTransaction}
          disabled={!canProceed || isProcessing || status !== 'idle'}
          aria-label="Sign and submit transaction"
        >
          {isProcessing
            ? 'Processing...'
            : hasInsufficientBalance
              ? 'Insufficient Balance'
              : 'Sign & Submit Transaction'}
        </Button>
      </div>
    </div>
  );
}
