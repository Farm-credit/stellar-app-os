'use client';

import type { JSX } from 'react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { WalletConnectionStep } from '@/components/organisms/WalletConnectionStep/WalletConnectionStep';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { useWalletContext } from '@/contexts/WalletContext';
import {
  buildRetireFlowSteps,
  getCompletedSteps,
  getCurrentStepFromPath,
} from '@/lib/utils/retireFlow';

function WalletContent(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { wallet } = useWalletContext();
  const [selectionParam, setSelectionParam] = useState<string | null>(null);

  useEffect(() => {
    const param = searchParams.get('selection');
    if (param) {
      setSelectionParam(param);
    } else {
      router.push('/credits/retire');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleNext = (): void => {
    if (selectionParam && wallet?.isConnected) {
      router.push(`/credits/retire/confirm?selection=${selectionParam}`);
    }
  };

  const currentStepId = getCurrentStepFromPath(pathname);
  const completedSteps = getCompletedSteps(currentStepId, !!selectionParam, !!wallet?.isConnected);
  const steps = useMemo(
    () => buildRetireFlowSteps(currentStepId, completedSteps, selectionParam),
    [currentStepId, completedSteps, selectionParam]
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <ProgressStepper steps={steps} />
      </div>
      <WalletConnectionStep
        title="Connect Wallet to Retire"
        description="Connect the wallet that holds the credits you want to retire."
        connectedTitle="Wallet Connected"
        connectedDescription="Your wallet is connected and ready to sign the retirement transaction."
      />
      {wallet?.isConnected && (
        <div className="flex justify-end pt-6">
          <Button
            stellar="primary"
            size="lg"
            onClick={handleNext}
            aria-label="Continue to confirmation"
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}

export default function RetireWalletPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-4xl px-4 py-8">
          <div className="text-center">
            <Text variant="h3" as="h2" className="mb-2">
              Loading wallet...
            </Text>
          </div>
        </div>
      }
    >
      <WalletContent />
    </Suspense>
  );
}
