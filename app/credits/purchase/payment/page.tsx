'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { PaymentMintingStep } from '@/components/organisms/PaymentMintingStep';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { Text } from '@/components/atoms/Text';
import { useWalletContext } from '@/contexts/WalletContext';
import {
  buildPurchaseFlowSteps,
  getCurrentStepFromPath,
  getCompletedSteps,
} from '@/lib/utils/purchaseFlow';
import type { CreditSelectionState } from '@/lib/types/carbon';

function PaymentContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { wallet } = useWalletContext();
  const [selection, setSelection] = useState<CreditSelectionState | null>(null);
  const [selectionParam, setSelectionParam] = useState<string | null>(null);

  useEffect(() => {
    const param = searchParams.get('selection');
    if (param) {
      setSelectionParam(param);
      try {
        const parsed = JSON.parse(decodeURIComponent(param)) as CreditSelectionState;
        setSelection(parsed);
      } catch (err) {
        console.error('Failed to parse selection:', err);
        router.push('/credits/purchase');
      }
    } else {
      router.push('/credits/purchase');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleComplete = (transactionHash: string) => {
    // Navigate to confirmation page with transaction details
    if (selection && wallet) {
      const param = encodeURIComponent(JSON.stringify(selection));
      const networkParam = wallet.network;
      router.push(
        `/credits/purchase/confirmation?selection=${param}&hash=${transactionHash}&network=${networkParam}`
      );
    }
  };

  const handleError = (error: string) => {
    console.error('Transaction error:', error);
  };

  const currentStepId = getCurrentStepFromPath(pathname);
  const completedSteps = getCompletedSteps(currentStepId, !!selection, !!wallet?.isConnected);
  const steps = useMemo(
    () => buildPurchaseFlowSteps(currentStepId, completedSteps, selectionParam),
    [currentStepId, completedSteps, selectionParam]
  );

  if (!selection || !wallet?.isConnected) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <ProgressStepper steps={steps} />
        </div>
        <div className="text-center">
          <Text variant="h3" as="h2" className="mb-2">
            Loading...
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <ProgressStepper steps={steps} />
      </div>
      <PaymentMintingStep
        selection={selection}
        wallet={wallet}
        onComplete={handleComplete}
        onError={handleError}
      />
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="text-center">
            <Text variant="h3" as="h2" className="mb-2">
              Loading...
            </Text>
          </div>
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
