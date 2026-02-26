'use client';

import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import type { PaymentMintingProps, TransactionStatus } from './PaymentMintingStep';

export function PaymentMintingStep({
  selection,
  wallet,
  onComplete,
  onError,
}: PaymentMintingProps) {
  const [status, setStatus] = useState<TransactionStatus>('idle');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment & Minting</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Text>Payment minting step - Implementation in progress</Text>
          <Text variant="muted">
            Project ID: {selection.projectId || 'Not selected'}
            <br />
            Quantity: {selection.quantity} tons
            <br />
            Total: ${selection.calculatedPrice.toFixed(2)}
          </Text>
          {wallet && (
            <Text variant="small" className="font-mono">
              Wallet: {wallet.publicKey.slice(0, 8)}...{wallet.publicKey.slice(-8)}
            </Text>
          )}
          <Button
            onClick={() => {
              setStatus('preparing');
              // TODO: Implement actual payment logic
              setTimeout(() => {
                setStatus('success');
                onComplete?.('mock-transaction-hash');
              }, 2000);
            }}
            disabled={status !== 'idle'}
          >
            {status === 'idle' ? 'Process Payment' : status}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { PaymentMintingStep as default };
