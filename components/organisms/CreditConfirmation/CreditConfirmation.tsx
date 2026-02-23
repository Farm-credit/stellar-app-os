'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/molecules/Card';
import { getStellarExplorerUrl } from '@/lib/stellar/transaction';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { trackEvent } from '@/lib/analytics';
import type { CreditSelectionState } from '@/lib/types/carbon';
import type { NetworkType } from '@/lib/types/wallet';

export interface CreditConfirmationProps {
  selection: CreditSelectionState;
  transactionHash: string;
  network: NetworkType;
}

export function CreditConfirmation({
  selection,
  transactionHash,
  network,
}: CreditConfirmationProps) {
  const router = useRouter();
  const selectedProject = mockCarbonProjects.find((p) => p.id === selection.projectId);

  useEffect(() => {
    // Track analytics event on mount
    trackEvent('credit_purchase_confirmed', {
      projectId: selection.projectId,
      quantity: selection.quantity,
      price: selection.calculatedPrice,
      transactionHash,
      network,
    });
  }, [
    selection.projectId,
    selection.quantity,
    selection.calculatedPrice,
    transactionHash,
    network,
  ]);

  const handleViewPortfolio = () => {
    router.push('/dashboard/credits');
  };

  const handleBuyMore = () => {
    router.push('/credits/purchase');
  };

  const explorerUrl = getStellarExplorerUrl(transactionHash, network);

  if (!selectedProject) {
    return (
      <div className="space-y-6">
        <Text variant="h3" as="h2" className="mb-2">
          Error
        </Text>
        <Text variant="muted" as="p">
          Project information not found.
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Message with Celebration */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <div className="h-20 w-20 rounded-full bg-stellar-green/20 flex items-center justify-center">
              <svg
                className="h-12 w-12 text-stellar-green"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-stellar-green flex items-center justify-center animate-pulse">
              <span className="text-white text-xs">✓</span>
            </div>
          </div>
        </div>
        <div>
          <Text variant="h2" as="h1" className="mb-2">
            Purchase Successful!
          </Text>
          <Text variant="muted" as="p" className="max-w-md mx-auto">
            Your carbon credits have been successfully minted and added to your wallet.
          </Text>
        </div>
      </div>

      {/* Credit Summary Card */}
      <Card className="border-stellar-green/30 bg-stellar-green/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="success">Minted</Badge>
            <span>Credit Summary</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Text variant="small" as="span" className="text-muted-foreground block mb-1">
                Project
              </Text>
              <Text variant="small" as="span" className="font-semibold">
                {selectedProject.name}
              </Text>
            </div>
            <div>
              <Text variant="small" as="span" className="text-muted-foreground block mb-1">
                Vintage Year
              </Text>
              <Text variant="small" as="span" className="font-semibold">
                {selectedProject.vintageYear}
              </Text>
            </div>
            <div>
              <Text variant="small" as="span" className="text-muted-foreground block mb-1">
                Quantity
              </Text>
              <Text variant="small" as="span" className="font-semibold">
                {selection.quantity.toFixed(2)} tons CO₂
              </Text>
            </div>
            <div>
              <Text variant="small" as="span" className="text-muted-foreground block mb-1">
                Total Paid
              </Text>
              <Text variant="small" as="span" className="font-semibold">
                ${selection.calculatedPrice.toFixed(2)} USDC
              </Text>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Hash Card */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Text variant="small" as="span" className="text-muted-foreground block mb-2">
              Transaction Hash
            </Text>
            <div className="flex items-center gap-2 flex-wrap">
              <Text variant="small" as="span" className="font-mono text-muted-foreground break-all">
                {transactionHash}
              </Text>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(explorerUrl, '_blank')}
                aria-label="View transaction on Stellar Explorer"
              >
                View on Explorer
              </Button>
            </div>
          </div>
          {network === 'testnet' && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-900/20 p-3">
              <Text variant="small" as="p" className="text-yellow-800 dark:text-yellow-200">
                <strong>Testnet Transaction:</strong> This transaction was made on the Stellar
                testnet network.
              </Text>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 pt-4">
        <Button
          stellar="primary"
          size="lg"
          className="flex-1"
          onClick={handleViewPortfolio}
          aria-label="View credits in portfolio"
        >
          View in Portfolio
        </Button>
        <Button
          stellar="primary-outline"
          size="lg"
          className="flex-1"
          onClick={handleBuyMore}
          aria-label="Buy more carbon credits"
        >
          Buy More Credits
        </Button>
      </div>
    </div>
  );
}
