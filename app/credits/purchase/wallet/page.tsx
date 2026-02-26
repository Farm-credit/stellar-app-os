'use client';

import { Suspense, useState, useEffect, useMemo, JSX } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { WalletConnectionStep } from '@/components/organisms/WalletConnectionStep/WalletConnectionStep';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  buildPurchaseFlowSteps,
  getCurrentStepFromPath,
  getCompletedSteps,
} from '@/lib/utils/purchaseFlow';
import { useAppTranslation } from '@/hooks/useTranslation';
import type { WalletConnection } from '@/lib/types/wallet';

function WalletContent(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useAppTranslation();
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [selectionParam, setSelectionParam] = useState<string | null>(null);

  useEffect(() => {
    const param = searchParams.get('selection');
    if (param) {
      setSelectionParam(param);
    } else {
      router.push('/credits/purchase');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleConnectionChange = (connection: WalletConnection | null): void => {
    setWallet(connection);
  };

  const handleNext = (): void => {
    if (selectionParam && wallet?.isConnected) {
      router.push(`/credits/purchase/payment?selection=${selectionParam}`);
    }
  };

  const currentStepId = getCurrentStepFromPath(pathname);
  const completedSteps = getCompletedSteps(currentStepId, !!selectionParam, !!wallet?.isConnected);
  const steps = useMemo(
    () => buildPurchaseFlowSteps(currentStepId, completedSteps, selectionParam),
    [currentStepId, completedSteps, selectionParam],
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <ProgressStepper steps={steps} />
      </div>
      <WalletConnectionStep onConnectionChange={handleConnectionChange} />
      {wallet?.isConnected && (
        <div className="flex justify-end pt-6">
          <Button
            stellar="primary"
            size="lg"
            onClick={handleNext}
            aria-label={t('purchase.continueToPayment')}
          >
            {t('purchase.nextButton')}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function WalletPage(): JSX.Element {
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
      <WalletContent />
    </Suspense>
  );
}