/**
 * Anonymous Donation Toggle Component
 * 
 * Allows users to enable privacy-preserving donations with ZK proofs.
 * Displays information about how anonymous donations work.
 */

'use client';

import { useState } from 'react';
import { Shield, Info, Lock, Eye, EyeOff } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';

interface AnonymousDonationToggleProps {
  isAnonymous: boolean;
  onToggle: (isAnonymous: boolean) => void; // eslint-disable-line no-unused-vars
  disabled?: boolean;
  className?: string;
}

export function AnonymousDonationToggle({
  isAnonymous,
  onToggle,
  disabled = false,
  className = '',
}: AnonymousDonationToggleProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Toggle Card */}
      <div
        className={`relative rounded-xl border-2 p-6 transition-all ${
          isAnonymous
            ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/20'
            : 'border-gray-200 bg-white dark:bg-gray-900'
        }`}
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className={`flex items-center justify-center w-12 h-12 rounded-lg transition-colors ${
              isAnonymous
                ? 'bg-purple-500 text-white'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {isAnonymous ? (
              <Shield className="w-6 h-6" aria-hidden="true" />
            ) : (
              <Lock className="w-6 h-6" aria-hidden="true" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Text className="font-semibold text-lg">Privacy-Preserving Donation</Text>
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label="Toggle information about anonymous donations"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>

            <Text variant="muted" className="text-sm mb-4">
              {isAnonymous
                ? 'Your donation will be submitted with zero-knowledge proof technology, keeping your wallet address completely private.'
                : 'Enable anonymous mode to donate privately using zero-knowledge proofs.'}
            </Text>

            {/* Features List */}
            {isAnonymous && (
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                  <span>Wallet address hidden</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
                  <Shield className="w-4 h-4" aria-hidden="true" />
                  <span>Cryptographic proof generated in-browser</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-300">
                  <Lock className="w-4 h-4" aria-hidden="true" />
                  <span>No personal data stored</span>
                </div>
              </div>
            )}

            {/* Toggle Button */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => onToggle(!isAnonymous)}
                disabled={disabled}
                role="switch"
                aria-checked={isAnonymous}
                aria-label="Toggle anonymous donation mode"
                className={`relative w-14 h-7 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isAnonymous ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                    isAnonymous ? 'translate-x-7' : ''
                  }`}
                />
              </button>
              <Text className="text-sm font-medium">
                {isAnonymous ? 'Anonymous Mode Active' : 'Standard Donation'}
              </Text>
            </div>
          </div>
        </div>

        {/* Badge */}
        {isAnonymous && (
          <div className="absolute top-4 right-4">
            <div className="px-3 py-1 rounded-full bg-purple-500 text-white text-xs font-semibold">
              PRIVATE
            </div>
          </div>
        )}
      </div>

      {/* Information Panel */}
      {showInfo && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-900 dark:border-gray-800 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500" aria-hidden="true" />
            <Text className="font-semibold">How Anonymous Donations Work</Text>
          </div>

          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p>
              <strong className="text-gray-900 dark:text-gray-100">
                Zero-Knowledge Proofs:
              </strong>{' '}
              Your browser generates a cryptographic proof that you have the funds to donate,
              without revealing your wallet address.
            </p>

            <p>
              <strong className="text-gray-900 dark:text-gray-100">In-Browser Generation:</strong>{' '}
              All proof generation happens locally in your browser using WebAssembly. Your private
              keys never leave your device.
            </p>

            <p>
              <strong className="text-gray-900 dark:text-gray-100">On-Chain Privacy:</strong> The
              transaction is submitted to the blockchain with only the proof, not your identity.
              The smart contract verifies the proof without learning who you are.
            </p>

            <p>
              <strong className="text-gray-900 dark:text-gray-100">Double-Spend Prevention:</strong>{' '}
              A unique nullifier prevents the same donation from being submitted twice, while
              keeping your identity private.
            </p>
          </div>

          <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
            <Text variant="muted" className="text-xs">
              <strong>Note:</strong> Anonymous donations may take a few extra seconds to process
              due to proof generation. A small relayer fee (~$0.50) may apply.
            </Text>
          </div>
        </div>
      )}
    </div>
  );
}
