'use client';

import type { JSX } from 'react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { useWalletContext } from '@/contexts/WalletContext';
import { useCreditPortfolio } from '@/hooks/useCreditPortfolio';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import {
  buildRetireFlowSteps,
  getCompletedSteps,
  getCurrentStepFromPath,
} from '@/lib/utils/retireFlow';
import type { RetirementSelection } from '@/lib/types/retire';

const MIN_RETIRE_QUANTITY = 0.1;

function RetireSelectionContent(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { wallet } = useWalletContext();
  const { credits, isLoading, error } = useCreditPortfolio(wallet?.publicKey ?? null);

  const activeCredits = useMemo(
    () => credits.filter((credit) => credit.status === 'active'),
    [credits]
  );

  const [selectedAssetCode, setSelectedAssetCode] = useState<string>('');
  const [quantityInput, setQuantityInput] = useState<string>('');
  const [quantityError, setQuantityError] = useState<string>('');
  const [hasPrefilled, setHasPrefilled] = useState(false);

  const selectedCredit = activeCredits.find((credit) => credit.assetCode === selectedAssetCode);

  useEffect(() => {
    if (hasPrefilled || activeCredits.length === 0) return;

    const selectionParam = searchParams.get('selection');
    if (selectionParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(selectionParam)) as RetirementSelection;
        if (parsed.assetCode) {
          setSelectedAssetCode(parsed.assetCode);
        } else if (parsed.projectId) {
          const match = activeCredits.find((credit) => credit.projectId === parsed.projectId);
          if (match) {
            setSelectedAssetCode(match.assetCode);
          }
        }
        if (parsed.quantity) {
          setQuantityInput(parsed.quantity.toString());
        }
      } catch (err) {
        console.error('Failed to parse selection param', err);
      }
      setHasPrefilled(true);
      return;
    }

    const projectId = searchParams.get('projectId');
    const quantity = searchParams.get('quantity');

    if (projectId) {
      const match = activeCredits.find((credit) => credit.projectId === projectId);
      if (match) {
        setSelectedAssetCode(match.assetCode);
      }
    }

    if (quantity) {
      setQuantityInput(quantity);
    }

    setHasPrefilled(true);
  }, [activeCredits, searchParams, hasPrefilled]);

  const validateQuantity = useCallback(
    (value: string): string => {
      if (!selectedCredit) return '';
      if (!value) return '';

      const numeric = Number.parseFloat(value);
      if (Number.isNaN(numeric) || numeric <= 0) {
        return 'Quantity must be greater than 0';
      }
      if (numeric < MIN_RETIRE_QUANTITY) {
        return `Minimum quantity is ${MIN_RETIRE_QUANTITY} tons CO₂`;
      }
      if (numeric > selectedCredit.quantity) {
        return `Maximum available is ${selectedCredit.quantity.toFixed(2)} tons CO₂`;
      }
      return '';
    },
    [selectedCredit]
  );

  useEffect(() => {
    setQuantityError(validateQuantity(quantityInput));
  }, [quantityInput, validateQuantity]);

  const selection = useMemo(() => {
    if (!selectedCredit) return null;
    const numeric = Number.parseFloat(quantityInput);
    if (Number.isNaN(numeric) || numeric <= 0 || quantityError) return null;

    const projectMeta = mockCarbonProjects.find(
      (project) => project.id.toLowerCase() === selectedCredit.projectId.toLowerCase()
    );

    const selectionData: RetirementSelection = {
      projectId: selectedCredit.projectId,
      projectName: selectedCredit.projectName,
      projectDescription:
        projectMeta?.description ?? 'Verified carbon offset project on the Stellar network.',
      assetCode: selectedCredit.assetCode,
      issuer: selectedCredit.issuer,
      vintage: selectedCredit.vintage,
      availableQuantity: selectedCredit.quantity,
      quantity: numeric,
      pricePerTon: selectedCredit.pricePerTon,
    };

    return selectionData;
  }, [selectedCredit, quantityInput, quantityError]);

  const selectionParam = selection ? encodeURIComponent(JSON.stringify(selection)) : null;

  const canProceed = Boolean(selection);

  const currentStepId = getCurrentStepFromPath(pathname);
  const completedSteps = getCompletedSteps(currentStepId, !!selection, !!wallet?.isConnected);
  const steps = useMemo(
    () => buildRetireFlowSteps(currentStepId, completedSteps, selectionParam),
    [currentStepId, completedSteps, selectionParam]
  );

  const handleNext = () => {
    if (!selectionParam) return;
    router.push(`/credits/retire/wallet?selection=${selectionParam}`);
  };

  if (!wallet?.isConnected) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <ProgressStepper steps={steps} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Connect Wallet to Retire Credits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Text variant="muted" as="p">
              Your portfolio lives on-chain. Connect your Stellar wallet to view and retire active
              credits.
            </Text>
            <Button stellar="primary" onClick={() => router.push('/credits/retire/wallet')}>
              Connect Wallet
            </Button>
          </CardContent>
        </Card>
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
            Select Credits to Retire
          </Text>
          <Text variant="muted" as="p">
            Choose an active credit holding and specify how many credits you want to retire.
          </Text>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <Text variant="small" as="p" className="text-destructive">
              {error}
            </Text>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="credit-select" className="block mb-2">
              <Text variant="small" as="span" className="font-semibold">
                Active Credit Holding
              </Text>
            </label>
            <Select
              id="credit-select"
              variant="primary"
              value={selectedAssetCode}
              onChange={(event) => {
                setSelectedAssetCode(event.target.value);
                setQuantityInput('');
                setQuantityError('');
              }}
              aria-label="Select credit holding"
              aria-required="true"
              disabled={isLoading || activeCredits.length === 0}
            >
              <option value="">Select a holding...</option>
              {activeCredits.map((credit) => (
                <option key={credit.assetCode} value={credit.assetCode}>
                  {credit.projectName} ({credit.vintage})
                </option>
              ))}
            </Select>
          </div>

          {selectedCredit && (
            <Card className="border-stellar-blue/20 bg-stellar-blue/5">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <Text variant="small" as="span" className="font-semibold">
                    Available Balance
                  </Text>
                  <Text variant="small" as="span">
                    {selectedCredit.quantity.toFixed(2)} tons CO₂
                  </Text>
                </div>
                <div className="flex items-center justify-between">
                  <Text variant="small" as="span" className="font-semibold">
                    Price per Ton
                  </Text>
                  <Text variant="small" as="span">
                    ${selectedCredit.pricePerTon.toFixed(2)}
                  </Text>
                </div>
                <div className="flex items-center justify-between">
                  <Text variant="small" as="span" className="font-semibold">
                    Asset Code
                  </Text>
                  <Text variant="small" as="span" className="font-mono">
                    {selectedCredit.assetCode}
                  </Text>
                </div>
              </CardContent>
            </Card>
          )}

          <div>
            <label htmlFor="retire-quantity" className="block mb-2">
              <Text variant="small" as="span" className="font-semibold">
                Quantity to Retire (tons CO₂)
              </Text>
              <Text variant="muted" as="span" className="ml-2 text-xs">
                Minimum: {MIN_RETIRE_QUANTITY} ton
              </Text>
            </label>
            <Input
              id="retire-quantity"
              type="number"
              step="0.1"
              min={MIN_RETIRE_QUANTITY}
              max={selectedCredit?.quantity ?? undefined}
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              variant={quantityError ? 'destructive' : 'primary'}
              placeholder="0.1"
              aria-label="Enter retirement quantity in tons CO₂"
              aria-required="true"
              aria-invalid={!!quantityError}
              aria-describedby={quantityError ? 'quantity-error' : undefined}
              disabled={!selectedCredit}
            />
            {quantityError && (
              <Text
                id="quantity-error"
                variant="small"
                as="p"
                className="mt-1 text-destructive"
                role="alert"
              >
                {quantityError}
              </Text>
            )}
          </div>

          {activeCredits.length === 0 && !isLoading && (
            <div className="rounded-lg border border-muted bg-muted/30 p-4">
              <Text variant="small" as="p" className="text-muted-foreground">
                No active credits available to retire. Purchase credits to get started.
              </Text>
              <Button stellar="primary" className="mt-3" asChild>
                <a href="/credits/purchase">Buy Credits</a>
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button
            stellar="primary"
            size="lg"
            onClick={handleNext}
            disabled={!canProceed}
            aria-label="Continue to wallet"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function RetireSelectionPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-4xl px-4 py-8">
          <Text variant="h3" as="p" className="text-center">
            Loading retirement flow...
          </Text>
        </div>
      }
    >
      <RetireSelectionContent />
    </Suspense>
  );
}
