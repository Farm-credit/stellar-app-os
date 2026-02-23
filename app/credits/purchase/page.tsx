'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CreditSelectionStep } from '@/components/organisms/CreditSelectionStep/CreditSelectionStep';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { Button } from '@/components/atoms/Button';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import {
  buildPurchaseFlowSteps,
  getCurrentStepFromPath,
  getCompletedSteps,
} from '@/lib/utils/purchaseFlow';
import type { CreditSelectionState } from '@/lib/types/carbon';

export default function PurchasePage() {
  const router = useRouter();
  const pathname = usePathname();
  const [selection, setSelection] = useState<CreditSelectionState | null>(null);

  const handleSelectionChange = useCallback((newSelection: CreditSelectionState) => {
    setSelection(newSelection);
  }, []);

  const handleNext = () => {
    if (selection) {
      const selectionParam = encodeURIComponent(JSON.stringify(selection));
      router.push(`/credits/purchase/wallet?selection=${selectionParam}`);
    }
  };

  const canProceed =
    selection?.projectId && selection.quantity > 0 && selection.calculatedPrice > 0;

  const currentStepId = getCurrentStepFromPath(pathname);
  const completedSteps = getCompletedSteps(currentStepId, !!selection, false);
  const steps = useMemo(
    () => buildPurchaseFlowSteps(currentStepId, completedSteps, null),
    [currentStepId, completedSteps]
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <ProgressStepper steps={steps} />
      </div>
      <CreditSelectionStep
        projects={mockCarbonProjects}
        onSelectionChange={handleSelectionChange}
      />
      <div className="flex justify-end pt-6">
        <Button
          stellar="primary"
          size="lg"
          onClick={handleNext}
          disabled={!canProceed}
          aria-label="Continue to wallet connection"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
