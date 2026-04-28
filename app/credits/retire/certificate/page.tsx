'use client';

import type { JSX } from 'react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';
import { CertificatePreview } from '@/components/organisms/CertificatePreview/CertificatePreview';
import { useWalletContext } from '@/contexts/WalletContext';
import {
  buildRetireFlowSteps,
  getCompletedSteps,
  getCurrentStepFromPath,
} from '@/lib/utils/retireFlow';
import type { RetirementSelection } from '@/lib/types/retire';
import type { CertificateData } from '@/lib/certificate';
import type { NetworkType } from '@/lib/types/wallet';

const EXPLORER_BASE_URLS: Record<NetworkType, string> = {
  mainnet: 'https://stellar.expert/explorer/public/tx',
  testnet: 'https://stellar.expert/explorer/testnet/tx',
};

function RetireCertificateContent(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { wallet } = useWalletContext();
  const [selection, setSelection] = useState<RetirementSelection | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [selectionParam, setSelectionParam] = useState<string | null>(null);

  useEffect(() => {
    const param = searchParams.get('selection');
    const hashParam = searchParams.get('hash');
    const networkParam = searchParams.get('network') as NetworkType | null;

    if (!param || !hashParam) {
      router.push('/credits/retire');
      return;
    }

    setSelectionParam(param);
    setTransactionHash(hashParam);
    setNetwork(networkParam ?? 'testnet');

    try {
      const parsed = JSON.parse(decodeURIComponent(param)) as RetirementSelection;
      setSelection(parsed);
    } catch (err) {
      console.error('Failed to parse certificate data', err);
      router.push('/credits/retire');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const currentStepId = getCurrentStepFromPath(pathname);
  const completedSteps = getCompletedSteps(currentStepId, !!selection, !!wallet?.isConnected);
  const steps = useMemo(
    () => buildRetireFlowSteps(currentStepId, completedSteps, selectionParam),
    [currentStepId, completedSteps, selectionParam]
  );

  const certificateData = useMemo<CertificateData | null>(() => {
    if (!selection || !transactionHash) return null;
    return {
      userName: null,
      walletAddress: selection.walletAddress ?? wallet?.publicKey ?? 'Stellar Wallet',
      quantityRetired: selection.quantity,
      treeCount: selection.treeCount ?? selection.quantity * 10, // Mock: 10 trees per credit if not provided
      co2Offset: selection.co2Offset ?? selection.quantity, // Mock: 1 ton per credit if not provided
      plantingDate: selection.plantingDate
        ? new Date(selection.plantingDate)
        : new Date(Date.now() - 31536000000), // Mock: 1 year ago
      region: selection.region ?? 'Amazon Basin, Brazil',
      projectName: selection.projectName,
      projectDescription: selection.projectDescription,
      transactionHash,
      retirementDate: selection.retirementDate ? new Date(selection.retirementDate) : new Date(),
      explorerBaseUrl: EXPLORER_BASE_URLS[network],
    };
  }, [selection, transactionHash, wallet?.publicKey, network]);

  if (!selection || !transactionHash || !certificateData) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <ProgressStepper steps={steps} />
        </div>
        <Text variant="h3" as="p" className="text-center">
          Preparing certificate...
        </Text>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <ProgressStepper steps={steps} />
      </div>
      <div className="space-y-6">
        <div>
          <Text variant="h3" as="h2" className="mb-2">
            Retirement Certificate
          </Text>
          <Text variant="muted" as="p">
            Your retirement is confirmed on-chain. Download the certificate for your records.
          </Text>
        </div>
        <CertificatePreview data={certificateData} />
        <div className="flex justify-end">
          <Button
            stellar="primary"
            onClick={() => router.push('/dashboard/credits?refresh=1')}
            aria-label="Back to portfolio"
          >
            Back to Portfolio
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function RetireCertificatePage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-5xl px-4 py-8">
          <Text variant="h3" as="p" className="text-center">
            Loading certificate...
          </Text>
        </div>
      }
    >
      <RetireCertificateContent />
    </Suspense>
  );
}
