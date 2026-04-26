'use client';

import React, { useState } from 'react';
import { Loader2, ShieldCheck, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { useWalletContext } from '@/contexts/WalletContext';
import { cn } from '@/lib/utils';

interface WalletSigningStepProps {
  transactionXdr: string;
  networkPassphrase: string;
  // eslint-disable-next-line no-unused-vars
  onSuccess: (signedXdr: string) => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export function WalletSigningStep({
  transactionXdr,
  networkPassphrase,
  onSuccess,
  onCancel,
  title = 'Sign Transaction',
  description = 'Please review and sign the transaction in your wallet.',
}: WalletSigningStepProps) {
  const { signTransaction, wallet, isLoading: contextLoading } = useWalletContext();
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);

  const handleSign = async () => {
    setIsSigning(true);
    setError(null);

    try {
      const signedXdr = await signTransaction(transactionXdr, networkPassphrase);
      setSigned(true);
      // Give a small delay for visual feedback
      setTimeout(() => {
        onSuccess(signedXdr);
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign transaction';
      setError(message);
    } finally {
      setIsSigning(false);
    }
  };

  if (signed) {
    return (
      <div className="flex flex-col items-center justify-center space-y-6 py-8 animate-in fade-in zoom-in duration-300">
        <div className="rounded-full bg-stellar-green/20 p-6 ring-8 ring-stellar-green/10">
          <CheckCircle2 className="h-16 w-16 text-stellar-green" />
        </div>
        <div className="text-center">
          <Text variant="h3" className="font-bold text-white mb-2">Transaction Signed</Text>
          <Text variant="muted">The transaction has been successfully signed.</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <Text variant="h3" as="h2" className="mb-2 font-bold tracking-tight">
          {title}
        </Text>
        <Text variant="muted" as="p" className="text-sm">
          {description}
        </Text>
      </div>

      <Card className="border-stellar-blue/20 bg-stellar-navy/40 overflow-hidden shadow-xl shadow-black/20">
        <CardHeader className="bg-stellar-navy/60 border-b border-white/5 pb-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-stellar-blue">
            <Lock className="h-4 w-4" />
            Security Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 rounded-full bg-stellar-blue/10 p-3">
              <ShieldCheck className="h-6 w-6 text-stellar-blue" />
            </div>
            <div className="space-y-1">
              <Text variant="small" className="font-semibold text-white">Wallet Connection</Text>
              <Text variant="muted" className="text-xs">
                Connected via {wallet?.type}: {wallet?.publicKey.slice(0, 8)}...{wallet?.publicKey.slice(-8)}
              </Text>
            </div>
          </div>

          <div className="rounded-lg bg-black/30 p-4 border border-white/5">
            <Text variant="small" className="text-white/50 font-mono text-[10px] break-all line-clamp-3">
              XDR Payload: {transactionXdr}
            </Text>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-4 animate-in shake duration-500" role="alert">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
              <Text variant="small" className="text-red-200">
                {error}
              </Text>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              className="flex-1 font-bold py-6 text-lg shadow-lg shadow-stellar-blue/20"
              onClick={handleSign}
              disabled={isSigning || contextLoading}
            >
              {isSigning ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Waiting for Wallet...
                </>
              ) : (
                <>Sign Transaction</>
              )}
            </Button>
            <Button
              variant="outline"
              className="flex-1 py-6 text-lg border-white/10 hover:bg-white/5"
              onClick={onCancel}
              disabled={isSigning}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-2 text-xs text-white/40">
        <ShieldCheck className="h-3 w-3" />
        Transactions are processed securely on the Stellar network
      </div>
    </div>
  );
}
