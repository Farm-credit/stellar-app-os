'use client';

import type { JSX } from 'react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { RetirementConfirmationModal } from '@/components/molecules/RetirementConfirmationModal';
import { useWalletContext } from '@/contexts/WalletContext';
import {
  buildRetireFlowSteps,
  getCompletedSteps,
  getCurrentStepFromPath,
} from '@/lib/utils/retireFlow';
import { buildRetirementTransaction } from '@/lib/stellar/retire';
import { submitTransaction } from '@/lib/stellar/transaction';
import { signTransactionWithAlbedo, signTransactionWithFreighter } from '@/lib/stellar/signing';
import type { RetirementSelection, RetirementTransactionStatus } from '@/lib/types/retire';

function getInitialIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `retire-${Date.now()}`;
}

function RetireConfirmContent(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { wallet } = useWalletContext();
  const [selection, setSelection] = useState<RetirementSelection | null>(null);
  const [selectionParam, setSelectionParam] = useState<string | null>(null);
  const [status, setStatus] = useState<RetirementTransactionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [idempotencyKey] = useState(getInitialIdempotencyKey);

  useEffect(() => {
    const param = searchParams.get('selection');
    if (!param) {
      router.push('/credits/retire');
      return;
    }

    setSelectionParam(param);
    try {
      const parsed = JSON.parse(decodeURIComponent(param)) as RetirementSelection;
      setSelection(parsed);
    } catch (err) {
      console.error('Failed to parse selection', err);
      router.push('/credits/retire');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!wallet?.isConnected && selectionParam) {
      router.push(`/credits/retire/wallet?selection=${selectionParam}`);
    }
  }, [wallet, selectionParam, router]);

  useEffect(() => {
    if (
      !wallet?.isConnected &&
      (status === 'preparing' || status === 'signing' || status === 'submitting')
    ) {
      setError('Wallet disconnected during signing. Please reconnect and retry.');
      setStatus('error');
    }
  }, [wallet, status]);

  const currentStepId = getCurrentStepFromPath(pathname);
  const completedSteps = getCompletedSteps(currentStepId, !!selection, !!wallet?.isConnected);
  const steps = useMemo(
    () => buildRetireFlowSteps(currentStepId, completedSteps, selectionParam),
    [currentStepId, completedSteps, selectionParam]
  );

  const handleProcessRetirement = async () => {
    if (!selection || !wallet?.isConnected) {
      setError('Wallet not connected. Please reconnect and try again.');
      setStatus('error');
      return;
    }

    if (transactionHash) {
      return;
    }

    setError(null);
    setStatus('preparing');

    try {
      const { transactionXdr, networkPassphrase } = await buildRetirementTransaction(
        selection,
        wallet.publicKey,
        wallet.network,
        idempotencyKey
      );

      if (!wallet?.isConnected) {
        throw new Error('Wallet disconnected during signing.');
      }

      setStatus('signing');
      let signedXdr: string;
      if (wallet.type === 'freighter') {
        signedXdr = await signTransactionWithFreighter(transactionXdr, networkPassphrase);
      } else if (wallet.type === 'albedo') {
        signedXdr = await signTransactionWithAlbedo(transactionXdr, wallet.network);
      } else {
        throw new Error('Unsupported wallet type for signing');
      }

      if (!wallet?.isConnected) {
        throw new Error('Wallet disconnected during submission.');
      }

      setStatus('submitting');
      const hash = await submitTransaction(signedXdr, wallet.network);
      setTransactionHash(hash);
      setStatus('success');

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('portfolio_refresh', `${Date.now()}`);
      }

      const selectionWithMeta: RetirementSelection = {
        ...selection,
        walletAddress: wallet.publicKey,
        retirementDate: new Date().toISOString(),
      };
      const updatedParam = encodeURIComponent(JSON.stringify(selectionWithMeta));
      router.push(
        `/credits/retire/certificate?selection=${updatedParam}&hash=${hash}&network=${wallet.network}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to retire credits';
      setError(message);
      setStatus('error');
    }
  };

  if (!selection || !selectionParam) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <ProgressStepper steps={steps} />
        </div>
        <Text variant="h3" as="p" className="text-center">
          Loading confirmation...
        </Text>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <ProgressStepper steps={steps} />
      </div>

      <div className="space-y-6">
        <div>
          <Text variant="h3" as="h2" className="mb-2">
            Review Retirement
          </Text>
          <Text variant="muted" as="p">
            Confirm the details and sign the blockchain transaction to permanently retire credits.
          </Text>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Retirement Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Text variant="small" as="span" className="text-muted-foreground">
                Project
              </Text>
              <Text variant="small" as="span" className="font-semibold">
                {selection.projectName}
              </Text>
            </div>
            <div className="flex items-center justify-between">
              <Text variant="small" as="span" className="text-muted-foreground">
                Quantity
              </Text>
              <Text variant="small" as="span" className="font-semibold">
                {selection.quantity.toLocaleString()} tCO₂e
              </Text>
            </div>
            <div className="flex items-center justify-between">
              <Text variant="small" as="span" className="text-muted-foreground">
                Vintage
              </Text>
              <Text variant="small" as="span" className="font-semibold">
                {selection.vintage}
              </Text>
            </div>
            <div className="flex items-center justify-between">
              <Text variant="small" as="span" className="text-muted-foreground">
                Asset Code
              </Text>
              <Text variant="small" as="span" className="font-mono">
                {selection.assetCode}
              </Text>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-2 p-4">
            <Text variant="small" as="p" className="font-semibold text-destructive">
              Irreversible Action
            </Text>
            <Text variant="small" as="p" className="text-destructive/90">
              Retiring credits permanently removes them from circulation. This cannot be undone.
            </Text>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <Text variant="small" as="p" className="text-destructive">
              {error}
            </Text>
            <Text variant="small" as="p" className="mt-1 text-muted-foreground">
              If the transaction was already submitted, check your wallet history before retrying.
            </Text>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          {status === 'error' && (
            <Button
              variant="outline"
              onClick={handleProcessRetirement}
              aria-label="Retry retirement"
            >
              Retry
            </Button>
          )}
          <Button
            stellar="primary"
            size="lg"
            onClick={() => setIsModalOpen(true)}
            disabled={status !== 'idle' && status !== 'error'}
            aria-label="Open retirement confirmation"
          >
            {status === 'preparing' || status === 'signing' || status === 'submitting'
              ? 'Processing...'
              : 'Retire Credits'}
          </Button>
        </div>
      </div>

      <RetirementConfirmationModal
        isOpen={isModalOpen}
        selection={selection}
        onCancel={() => setIsModalOpen(false)}
        onConfirm={() => {
          setIsModalOpen(false);
          void handleProcessRetirement();
        }}
        isLoading={status === 'preparing' || status === 'signing' || status === 'submitting'}
      />
    </div>
  );
}

export default function RetireConfirmPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-4xl px-4 py-8">
          <Text variant="h3" as="p" className="text-center">
            Loading confirmation...
          </Text>
        </div>
      }
    >
      <RetireConfirmContent />
    </Suspense>
  );
}
