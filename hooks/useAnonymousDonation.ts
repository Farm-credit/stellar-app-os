/**
 * Hook for managing anonymous donations with ZK proofs
 * 
 * This hook handles the complete flow of privacy-preserving donations:
 * 1. Generate ZK proof in-browser
 * 2. Build anonymous transaction
 * 3. Submit through relayer (optional)
 * 4. Track donation status
 */

'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { AnonymousDonationProof, ProofGenerationResult } from '@/lib/zk/types';
import {
  generateAnonymousDonationProof,
  verifyAnonymousDonationProof,
} from '@/lib/zk/prover';
import {
  buildAnonymousDonationTransaction,
  isNullifierUsed,
  estimateAnonymousDonationCost,
} from '@/lib/stellar/anonymous-donation';
import type { NetworkType } from '@/lib/types/wallet';

export type AnonymousDonationStatus =
  | 'idle'
  | 'generating-proof'
  | 'proof-generated'
  | 'building-transaction'
  | 'submitting'
  | 'success'
  | 'error';

interface UseAnonymousDonationReturn {
  // State
  status: AnonymousDonationStatus;
  proof: AnonymousDonationProof | null;
  transactionHash: string | null;
  error: string | null;
  isProcessing: boolean;
  proofGenerationTime: number | null;

  // Actions
  generateProof: (
    walletAddress: string,
    amount: number
  ) => Promise<ProofGenerationResult>;
  submitAnonymousDonation: (
    amount: number,
    proof: AnonymousDonationProof,
    relayerPublicKey: string,
    network: NetworkType
  ) => Promise<{ success: boolean; transactionHash?: string; error?: string }>;
  reset: () => void;
  
  // Utilities
  estimateCost: (amount: number) => ReturnType<typeof estimateAnonymousDonationCost>;
  checkNullifier: (nullifier: string, network: NetworkType) => Promise<boolean>;
}

export function useAnonymousDonation(): UseAnonymousDonationReturn {
  const [status, setStatus] = useState<AnonymousDonationStatus>('idle');
  const [proof, setProof] = useState<AnonymousDonationProof | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofGenerationTime, setProofGenerationTime] = useState<number | null>(null);

  const isProcessing =
    status === 'generating-proof' ||
    status === 'building-transaction' ||
    status === 'submitting';

  /**
   * Generate ZK proof for anonymous donation
   */
  const generateProof = useCallback(
    async (walletAddress: string, amount: number): Promise<ProofGenerationResult> => {
      setStatus('generating-proof');
      setError(null);

      try {
        toast.info('Generating zero-knowledge proof...', {
          description: 'This may take a few seconds',
        });

        const result = await generateAnonymousDonationProof(walletAddress, amount);

        if (result.success && result.proof) {
          setProof(result.proof);
          setProofGenerationTime(result.generationTimeMs || null);
          setStatus('proof-generated');

          toast.success('Proof generated successfully', {
            description: `Generated in ${Math.round(result.generationTimeMs || 0)}ms`,
          });

          return result;
        } else {
          setStatus('error');
          setError(result.error || 'Failed to generate proof');

          toast.error('Proof generation failed', {
            description: result.error,
          });

          return result;
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error during proof generation';
        setStatus('error');
        setError(errorMessage);

        toast.error('Proof generation failed', {
          description: errorMessage,
        });

        return {
          success: false,
          error: errorMessage,
        };
      }
    },
    []
  );

  /**
   * Submit anonymous donation with ZK proof
   */
  const submitAnonymousDonation = useCallback(
    async (
      amount: number,
      donationProof: AnonymousDonationProof,
      relayerPublicKey: string,
      network: NetworkType
    ): Promise<{ success: boolean; transactionHash?: string; error?: string }> => {
      setStatus('building-transaction');
      setError(null);

      try {
        // Verify proof before submission
        const isValid = await verifyAnonymousDonationProof(donationProof);
        if (!isValid) {
          throw new Error('Invalid proof - verification failed');
        }

        // Check if nullifier has been used
        const nullifierUsed = await isNullifierUsed(donationProof.nullifier, network);
        if (nullifierUsed) {
          throw new Error('This donation has already been submitted (nullifier already used)');
        }

        toast.info('Building anonymous transaction...');

        // Build anonymous transaction
        const { transactionXdr, networkPassphrase, nullifier } =
          await buildAnonymousDonationTransaction(
            amount,
            donationProof,
            relayerPublicKey,
            network
          );

        setStatus('submitting');
        toast.info('Submitting anonymous donation...');

        // Submit transaction through API
        const response = await fetch('/api/transaction/submit-anonymous', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transactionXdr,
            network,
            proof: donationProof,
            nullifier,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to submit transaction');
        }

        const { transactionHash: txHash } = await response.json();

        setTransactionHash(txHash);
        setStatus('success');

        toast.success('Anonymous donation successful!', {
          description: 'Your donation has been submitted privately',
        });

        return {
          success: true,
          transactionHash: txHash,
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error during submission';
        setStatus('error');
        setError(errorMessage);

        toast.error('Donation submission failed', {
          description: errorMessage,
        });

        return {
          success: false,
          error: errorMessage,
        };
      }
    },
    []
  );

  /**
   * Reset the hook state
   */
  const reset = useCallback(() => {
    setStatus('idle');
    setProof(null);
    setTransactionHash(null);
    setError(null);
    setProofGenerationTime(null);
  }, []);

  /**
   * Estimate cost of anonymous donation
   */
  const estimateCost = useCallback((amount: number) => {
    return estimateAnonymousDonationCost(amount);
  }, []);

  /**
   * Check if a nullifier has been used
   */
  const checkNullifier = useCallback(
    async (nullifier: string, network: NetworkType): Promise<boolean> => {
      return await isNullifierUsed(nullifier, network);
    },
    []
  );

  return {
    status,
    proof,
    transactionHash,
    error,
    isProcessing,
    proofGenerationTime,
    generateProof,
    submitAnonymousDonation,
    reset,
    estimateCost,
    checkNullifier,
  };
}
