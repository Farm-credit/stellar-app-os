'use client';

import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import type { PaymentMintingProps, TransactionStatus } from '@/lib/types/payment';

// Re-export surface types from the canonical source so adjacent files
// can still import them from `@/components/organisms/PaymentMintingStep`.
export type { PaymentMintingProps, TransactionStatus };

/**
 * Review-and-confirm step in the carbon credit purchase wizard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any

export function PaymentMintingStep({
  error,
  status,
  hasInsufficientBalance,
  selection,
  wallet,
  selectedProject,
  handleSignTransaction,
  canProceed,
  isProcessing,
  setError,
  setStatus,
}: any) {
  return (
    <div className="space-y-6">
      <div>
        <Text variant="h3" as="h2" className="mb-2">
          Review &amp; Confirm Payment
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
          <div
            className="rounded-lg border border-stellar-blue/30 bg-stellar-blue/5 p-4"
            role="status"
            aria-live="polite"
          >
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
