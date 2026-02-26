'use client';

import { Suspense, useState, useEffect, useMemo, JSX } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { CreditConfirmation } from '@/components/organisms/CreditConfirmation/CreditConfirmation';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { Text } from '@/components/atoms/Text';
import {
  buildPurchaseFlowSteps,
  getCurrentStepFromPath,
  getCompletedSteps,
} from '@/lib/utils/purchaseFlow';
import { useAppTranslation } from '@/hooks/useTranslation';
import type { CreditSelectionState } from '@/lib/types/carbon';
import type { NetworkType } from '@/lib/types/wallet';

function ConfirmationContent(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useAppTranslation();
  const [selection, setSelection] = useState<CreditSelectionState | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkType | null>(null);
  const [selectionParam, setSelectionParam] = useState<string | null>(null);

  useEffect(() => {
    const param = searchParams.get('selection');
    const hashParam = searchParams.get('hash');
    const networkParam = searchParams.get('network') as NetworkType | null;

    if (!param || !hashParam) {
      router.push('/credits/purchase');
      return;
    }

    setSelectionParam(param);
    try {
      const parsed = JSON.parse(decodeURIComponent(param)) as CreditSelectionState;
      setSelection(parsed);
      setTransactionHash(hashParam);
      setNetwork(networkParam ?? 'testnet');
    } catch (err) {
      console.error('Failed to parse confirmation data:', err);
      router.push('/credits/purchase');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const currentStepId = getCurrentStepFromPath(pathname);
  const completedSteps = getCompletedSteps(currentStepId, !!selection, true);
  const steps = useMemo(
    () => buildPurchaseFlowSteps(currentStepId, completedSteps, selectionParam),
    [currentStepId, completedSteps, selectionParam],
  );

  if (!selection || !transactionHash || !network) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <ProgressStepper steps={steps} />
        </div>
        <div className="text-center">
          <Text variant="h3" as="h2" className="mb-2">
            {t('purchase.loading')}
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
      <CreditConfirmation
        selection={selection}
        transactionHash={transactionHash}
        network={network}
      />
    </div>
  );
}

export default function ConfirmationPage(): JSX.Element {
  const { t } = useAppTranslation();
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="text-center">
            <Text variant="h3" as="h2" className="mb-2">
              {t('purchase.loading')}
            </Text>
          </div>
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}