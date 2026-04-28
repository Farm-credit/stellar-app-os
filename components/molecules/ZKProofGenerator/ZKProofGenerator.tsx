/**
 * ZK Proof Generator Component
 * 
 * Displays the proof generation process with progress indicators
 * and technical details for transparency.
 */

'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Shield, Cpu, Lock } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import type { AnonymousDonationStatus } from '@/hooks/useAnonymousDonation';

interface ZKProofGeneratorProps {
  status: AnonymousDonationStatus;
  proofGenerationTime: number | null;
  error: string | null;
  className?: string;
}

export function ZKProofGenerator({
  status,
  proofGenerationTime,
  error,
  className = '',
}: ZKProofGeneratorProps) {
  const [progress, setProgress] = useState(0);

  // Simulate progress during proof generation
  useEffect(() => {
    if (status === 'generating-proof') {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 15;
        });
      }, 200);

      return () => clearInterval(interval);
    } else if (status === 'proof-generated') {
      setProgress(100);
    }
  }, [status]);

  if (status === 'idle') {
    return null;
  }

  const isGenerating = status === 'generating-proof';
  const isGenerated = status === 'proof-generated';
  const hasError = status === 'error' && error;

  return (
    <div className={`rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800 p-6 space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        {isGenerating && (
          <Loader2 className="w-6 h-6 text-purple-500 animate-spin" aria-hidden="true" />
        )}
        {isGenerated && (
          <CheckCircle2 className="w-6 h-6 text-green-500" aria-hidden="true" />
        )}
        {hasError && <AlertCircle className="w-6 h-6 text-red-500" aria-hidden="true" />}

        <div>
          <Text className="font-semibold text-lg">
            {isGenerating && 'Generating Zero-Knowledge Proof'}
            {isGenerated && 'Proof Generated Successfully'}
            {hasError && 'Proof Generation Failed'}
          </Text>
          <Text variant="muted" className="text-sm">
            {isGenerating && 'Computing cryptographic proof in your browser...'}
            {isGenerated &&
              proofGenerationTime &&
              `Completed in ${Math.round(proofGenerationTime)}ms`}
            {hasError && error}
          </Text>
        </div>
      </div>

      {/* Progress Bar */}
      {isGenerating && (
        <div className="space-y-2">
          <div className="w-full h-2 bg-purple-200 dark:bg-purple-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <Text variant="muted" className="text-xs text-center">
            {Math.round(progress)}% complete
          </Text>
        </div>
      )}

      {/* Process Steps */}
      {(isGenerating || isGenerated) && (
        <div className="space-y-3 pt-2">
          <ProofStep
            icon={<Cpu className="w-4 h-4" />}
            label="Circuit computation"
            status={progress > 30 ? 'complete' : isGenerating ? 'active' : 'pending'}
          />
          <ProofStep
            icon={<Shield className="w-4 h-4" />}
            label="Witness generation"
            status={progress > 60 ? 'complete' : progress > 30 ? 'active' : 'pending'}
          />
          <ProofStep
            icon={<Lock className="w-4 h-4" />}
            label="Proof construction"
            status={isGenerated ? 'complete' : progress > 60 ? 'active' : 'pending'}
          />
        </div>
      )}

      {/* Technical Details */}
      {isGenerated && (
        <div className="pt-3 border-t border-purple-200 dark:border-purple-800">
          <Text variant="muted" className="text-xs space-y-1">
            <div className="flex justify-between">
              <span>Protocol:</span>
              <span className="font-mono">Groth16</span>
            </div>
            <div className="flex justify-between">
              <span>Curve:</span>
              <span className="font-mono">BN254</span>
            </div>
            <div className="flex justify-between">
              <span>Proof Size:</span>
              <span className="font-mono">~256 bytes</span>
            </div>
          </Text>
        </div>
      )}

      {/* Privacy Notice */}
      {isGenerated && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
          <Shield className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <Text className="text-xs text-green-700 dark:text-green-300">
            Your wallet address is now cryptographically hidden. The proof can verify your donation
            without revealing your identity.
          </Text>
        </div>
      )}
    </div>
  );
}

interface ProofStepProps {
  icon: React.ReactNode;
  label: string;
  status: 'pending' | 'active' | 'complete';
}

function ProofStep({ icon, label, status }: ProofStepProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
          status === 'complete'
            ? 'bg-green-500 text-white'
            : status === 'active'
              ? 'bg-purple-500 text-white'
              : 'bg-gray-200 dark:bg-gray-800 text-gray-400'
        }`}
      >
        {status === 'complete' ? (
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        ) : status === 'active' ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          icon
        )}
      </div>
      <Text
        className={`text-sm ${
          status === 'complete'
            ? 'text-green-700 dark:text-green-300 font-medium'
            : status === 'active'
              ? 'text-purple-700 dark:text-purple-300 font-medium'
              : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {label}
      </Text>
    </div>
  );
}
