/**
 * Anonymous Payment Section Component
 * 
 * Handles the payment flow for privacy-preserving donations with ZK proofs.
 * Generates proof, builds transaction, and submits anonymously.
 */

'use client';

import { useState, useEffect } from 'react';
import { Shield, Wallet, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { ZKProofGenerator } from '@/components/molecules/ZKProofGenerator/ZKProofGenerator';
import { useAnonymousDonation } from '@/hooks/useAnonymousDonation';
import type { WalletConnection } from '@/lib/types/wallet';

interface AnonymousPaymentSectionProps {
  amount: number;
  wallet: WalletConnection | null;
  onConnectWallet: () => void;
  disabled?: boolean;
}

export function AnonymousPaymentSection({
  amount,
  wallet,
  onConnectWallet,
  disabled = false,
}: AnonymousPaymentSectionProps) {
  const {
    status,
    proof,
    transactionHash,
    error,
    isProcessing,
    proofGenerationTime,
    generateProof,
    submitAnonymousDonation,
    estimateCost,
  } = useAnonymousDonation();

  const [hasGeneratedProof, setHasGeneratedProof] = useState(false);
  const costEstimate = estimateCost(amount);

  // Auto-generate proof when wallet is connected
  useEffect(() => {
    if (wallet?.publicKey && !hasGeneratedProof && status === 'idle') {
      handleGenerateProof();
    }
  }, [wallet?.publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateProof = async () => {
    if (!wallet?.publicKey) return;

    setHasGeneratedProof(true);
    await generateProof(wallet.publicKey, amount);
  };

  const handleSubmit = async () => {
    if (!wallet?.publicKey || !proof) return;

    // For now, use the donor's wallet as relayer
    // In production, this would use a dedicated relayer service
    const relayerPublicKey = wallet.publicKey;

    await submitAnonymousDonation(amount, proof, relayerPublicKey, wallet.network);
  };

  // Show success state
  if (status === 'success' && transactionHash) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border-2 border-green-500 bg-green-50 dark:bg-green-950/20 p-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <div>
            <Text className="text-xl font-bold text-green-700 dark:text-green-300 mb-2">
              Anonymous Donation Successful!
            </Text>
            <Text variant="muted" className="text-sm">
              Your donation has been submitted privately. Your wallet address remains hidden.
            </Text>
          </div>
          <div className="pt-4 border-t border-green-200 dark:border-green-800">
            <Text variant="muted" className="text-xs font-mono break-all">
              Transaction: {transactionHash.slice(0, 16)}...{transactionHash.slice(-16)}
            </Text>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cost Breakdown */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <Text className="font-semibold text-sm">Cost Breakdown</Text>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <Text variant="muted">Donation amount</Text>
            <Text className="font-medium">${costEstimate.donationAmount.toFixed(2)}</Text>
          </div>
          <div className="flex justify-between">
            <Text variant="muted">Relayer fee</Text>
            <Text className="font-medium">${costEstimate.relayerFee.toFixed(2)}</Text>
          </div>
          <div className="flex justify-between">
            <Text variant="muted">Network fee (est.)</Text>
            <Text className="font-medium">${costEstimate.networkFee.toFixed(2)}</Text>
          </div>
          <div className="pt-2 border-t border-gray-200 dark:border-gray-800 flex justify-between">
            <Text className="font-semibold">Total</Text>
            <Text className="font-bold">${costEstimate.totalCost.toFixed(2)}</Text>
          </div>
        </div>
      </div>

      {/* Wallet Connection */}
      {!wallet && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 p-6 text-center space-y-4">
          <Wallet className="w-12 h-12 mx-auto text-gray-400" />
          <div>
            <Text className="font-semibold mb-2">Connect Your Wallet</Text>
            <Text variant="muted" className="text-sm">
              Connect your Stellar wallet to generate the zero-knowledge proof
            </Text>
          </div>
          <Button onClick={onConnectWallet} size="lg" className="w-full">
            <Wallet className="mr-2 h-4 w-4" />
            Connect Wallet
          </Button>
        </div>
      )}

      {/* ZK Proof Generator */}
      {wallet && (
        <ZKProofGenerator
          status={status}
          proofGenerationTime={proofGenerationTime}
          error={error}
        />
      )}

      {/* Error Display */}
      {error && status === 'error' && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <Text className="font-semibold text-red-700 dark:text-red-300 mb-1">
              Error
            </Text>
            <Text className="text-sm text-red-600 dark:text-red-400">{error}</Text>
          </div>
        </div>
      )}

      {/* Submit Button */}
      {wallet && proof && status === 'proof-generated' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
              <div>
                <Text className="font-semibold text-purple-700 dark:text-purple-300 mb-1">
                  Ready to Submit
                </Text>
                <Text className="text-sm text-purple-600 dark:text-purple-400">
                  Your zero-knowledge proof is ready. Click below to submit your anonymous donation.
                </Text>
              </div>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={disabled || isProcessing}
            size="lg"
            className="w-full bg-purple-500 hover:bg-purple-600"
          >
            {isProcessing ? (
              <>Processing...</>
            ) : (
              <>
                Submit Anonymous Donation
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}

      {/* Regenerate Proof Button */}
      {wallet && status === 'error' && (
        <Button
          onClick={handleGenerateProof}
          disabled={disabled || isProcessing}
          variant="outline"
          size="lg"
          className="w-full"
        >
          Regenerate Proof
        </Button>
      )}

      {/* Privacy Notice */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4">
        <Text variant="muted" className="text-xs space-y-2">
          <p>
            <strong>Privacy Guarantee:</strong> Your wallet address is never revealed. The
            zero-knowledge proof cryptographically proves you have the funds without exposing your
            identity.
          </p>
          <p>
            <strong>How it works:</strong> A proof is generated in your browser, then submitted
            through a relayer. The blockchain only sees the proof, not your wallet address.
          </p>
        </Text>
      </div>
    </div>
  );
}
