'use client';

/**
 * CrossChainBridge — Issue #1093
 *
 * UI component for purchasing tree sponsorships using wrapped XLM on other
 * Stellar-compatible chains via the bridge mechanism.
 *
 * Features:
 *   - Select source chain (Ethereum, Polygon, etc.)
 *   - Enter source chain address
 *   - Select recipient Stellar wallet
 *   - Calculate bridge fee
 *   - Lock XLM for cross-chain purchase
 *   - Display lock status and transaction details
 */

import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Lock, CheckCircle, AlertCircle, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner/LoadingSpinner';
import { useWalletContext } from '@/contexts/WalletContext';
import {
  lockForPurchase,
  getBridgeConfig,
  quoteBridgeFee,
  getBridgeLock,
  type BridgeConfig,
  type BridgeLock,
  type LockForPurchaseParams,
} from '@/lib/stellar/xlm-bridge';
import { showToast } from '@/lib/toast';
import type { NetworkType } from '@/lib/types/wallet';

// Supported source chains
const SOURCE_CHAINS = [
  { id: 'ethereum', name: 'Ethereum', icon: '⟠' },
  { id: 'polygon', name: 'Polygon', icon: '⬡' },
  { id: 'arbitrum', name: 'Arbitrum', icon: '◈' },
  { id: 'optimism', name: 'Optimism', icon: '○' },
  { id: 'base', name: 'Base', icon: '◇' },
] as const;

type SourceChain = (typeof SOURCE_CHAINS)[number]['id'];

interface CrossChainBridgeProps {
  farmer: string;
  treeCount: number;
  areaHectares: number;
  amount: string; // in stroops
  network?: NetworkType;
  onLockSuccess?: (lockId: number, txHash: string) => void;
  className?: string;
}

interface FormState {
  sourceChain: SourceChain;
  sourceAddress: string;
  recipient: string;
  isSubmitting: boolean;
  lockId: number | null;
  txHash: string | null;
  error: string | null;
}

export function CrossChainBridge({
  farmer,
  treeCount,
  areaHectares,
  amount,
  network = 'testnet',
  onLockSuccess,
  className,
}: CrossChainBridgeProps) {
  const { walletAddress, walletType } = useWalletContext();
  const [config, setConfig] = useState<BridgeConfig | null>(null);
  const [fee, setFee] = useState<string>('0');
  const [lock, setLock] = useState<BridgeLock | null>(null);

  const [form, setForm] = useState<FormState>({
    sourceChain: 'ethereum',
    sourceAddress: '',
    recipient: walletAddress || '',
    isSubmitting: false,
    lockId: null,
    txHash: null,
    error: null,
  });

  // Load bridge config on mount
  useEffect(() => {
    getBridgeConfig(network)
      .then(setConfig)
      .catch((err) => {
        console.error('Failed to load bridge config:', err);
        setForm((prev) => ({ ...prev, error: 'Failed to load bridge configuration' }));
      });
  }, [network]);

  // Update recipient when wallet connects
  useEffect(() => {
    if (walletAddress && !form.recipient) {
      setForm((prev) => ({ ...prev, recipient: walletAddress }));
    }
  }, [walletAddress, form.recipient]);

  // Calculate fee when amount changes
  useEffect(() => {
    if (amount && config) {
      quoteBridgeFee(amount, network)
        .then(setFee)
        .catch((err) => {
          console.error('Failed to quote fee:', err);
        });
    }
  }, [amount, network, config]);

  // Poll lock status if lock exists
  useEffect(() => {
    if (form.lockId) {
      const interval = setInterval(() => {
        getBridgeLock(form.lockId!, network)
          .then(setLock)
          .catch((err) => console.error('Failed to fetch lock status:', err));
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [form.lockId, network]);

  const handleSubmit = useCallback(async () => {
    if (!walletAddress || !walletType) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    if (!form.sourceAddress) {
      setForm((prev) => ({ ...prev, error: 'Please enter your source chain address' }));
      return;
    }

    if (!form.recipient) {
      setForm((prev) => ({ ...prev, error: 'Please enter a recipient Stellar address' }));
      return;
    }

    setForm((prev) => ({ ...prev, isSubmitting: true, error: null }));

    try {
      const params: LockForPurchaseParams = {
        senderAddress: walletAddress,
        recipient: form.recipient,
        farmer,
        amount,
        treeCount: treeCount.toString(),
        areaHectares: areaHectares.toString(),
        sourceChain: form.sourceChain,
        sourceSender: form.sourceAddress,
        walletType: walletType === 'freighter' ? 'freighter' : 'albedo',
      };

      const txHash = await lockForPurchase(params, network);

      // Extract lock ID from events (simplified - in production, parse events)
      const lockId = config ? config.lockCount + 1 : 0;

      setForm((prev) => ({
        ...prev,
        isSubmitting: false,
        lockId,
        txHash,
      }));

      showToast('XLM locked successfully! Waiting for bridge execution.', 'success');
      onLockSuccess?.(lockId, txHash);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to lock XLM';
      setForm((prev) => ({ ...prev, isSubmitting: false, error: errorMessage }));
      showToast(errorMessage, 'error');
    }
  }, [
    walletAddress,
    walletType,
    form.sourceAddress,
    form.recipient,
    form.sourceChain,
    farmer,
    amount,
    treeCount,
    areaHectares,
    network,
    config,
    onLockSuccess,
  ]);

  const formatStroops = (stroops: string) => {
    const xlm = Number(stroops) / 10_000_000;
    return xlm.toFixed(7);
  };

  const getNetworkUrl = (txHash: string) => {
    return network === 'mainnet'
      ? `https://stellar.expert/explorer/public/tx/${txHash}`
      : `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  };

  if (form.lockId && lock) {
    return (
      <div className={className}>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-50">
              <Lock className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <Text variant="h3" className="text-lg font-semibold">
                XLM Locked
              </Text>
              <Text variant="muted" className="text-sm">
                Lock #{form.lockId}
              </Text>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex justify-between text-sm">
              <Text variant="muted">Status</Text>
              <Badge
                variant={
                  lock.status === 'Executed'
                    ? 'default'
                    : lock.status === 'Cancelled'
                      ? 'destructive'
                      : 'outline'
                }
              >
                {lock.status}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <Text variant="muted">Amount Locked</Text>
              <Text variant="body" className="font-semibold">
                {formatStroops(lock.amount)} XLM
              </Text>
            </div>
            <div className="flex justify-between text-sm">
              <Text variant="muted">Bridge Fee</Text>
              <Text variant="body" className="font-semibold">
                {formatStroops(lock.feePaid)} XLM
              </Text>
            </div>
            <div className="flex justify-between text-sm">
              <Text variant="muted">Trees</Text>
              <Text variant="body" className="font-semibold">
                {lock.treesBought}
              </Text>
            </div>
          </div>

          {form.txHash && (
            <a
              href={getNetworkUrl(form.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center text-sm text-blue-600 hover:text-blue-700"
            >
              View Transaction →
            </a>
          )}

          {lock.status === 'Locked' && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <Text variant="small" className="text-blue-700">
                Your XLM is locked and waiting for bridge execution. The bridge operator will
                process your purchase shortly.
              </Text>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <ArrowRight className="w-5 h-5 text-stellar-green" />
          <Text variant="h3" className="text-lg font-semibold">
            Cross-Chain Purchase
          </Text>
        </div>

        <div className="space-y-4">
          {/* Source Chain Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              <Text variant="body">Source Chain</Text>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SOURCE_CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, sourceChain: chain.id }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    form.sourceChain === chain.id
                      ? 'border-stellar-green bg-green-50 text-green-700'
                      : 'border-border hover:border-border/80'
                  }`}
                  aria-label={`Select ${chain.name}`}
                >
                  <span className="text-lg">{chain.icon}</span>
                  <span>{chain.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Source Chain Address */}
          <div>
            <label htmlFor="source-address" className="block text-sm font-medium mb-2">
              <Text variant="body">
                Your {SOURCE_CHAINS.find((c) => c.id === form.sourceChain)?.name} Address
              </Text>
            </label>
            <input
              id="source-address"
              type="text"
              value={form.sourceAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, sourceAddress: e.target.value }))}
              placeholder="0x..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-stellar-green/20"
              aria-describedby="source-address-hint"
            />
            <Text variant="small" id="source-address-hint" className="text-muted-foreground mt-1">
              Your wallet address on the source chain
            </Text>
          </div>

          {/* Recipient Stellar Address */}
          <div>
            <label htmlFor="recipient" className="block text-sm font-medium mb-2">
              <Text variant="body">Recipient Stellar Address</Text>
            </label>
            <input
              id="recipient"
              type="text"
              value={form.recipient}
              onChange={(e) => setForm((prev) => ({ ...prev, recipient: e.target.value }))}
              placeholder="G..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-stellar-green/20"
              aria-describedby="recipient-hint"
            />
            <Text variant="small" id="recipient-hint" className="text-muted-foreground mt-1">
              Stellar wallet that will receive the sponsorship receipts
            </Text>
          </div>

          {/* Fee Summary */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <div className="flex justify-between text-sm">
              <Text variant="muted">Amount to Lock</Text>
              <Text variant="body" className="font-semibold">
                {formatStroops(amount)} XLM
              </Text>
            </div>
            <div className="flex justify-between text-sm">
              <Text variant="muted">Bridge Fee</Text>
              <Text variant="body" className="font-semibold">
                {formatStroops(fee)} XLM ({config ? (config.feeBps / 100).toFixed(2) : 0}%)
              </Text>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-border">
              <Text variant="body" className="font-medium">
                Total for Purchase
              </Text>
              <Text variant="body" className="font-semibold">
                {formatStroops(amount)} XLM
              </Text>
            </div>
          </div>

          {/* Error Display */}
          {form.error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <Text variant="small" className="text-red-700">
                {form.error}
              </Text>
            </div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={form.isSubmitting || !walletAddress}
            className="w-full"
            aria-label="Lock XLM for cross-chain purchase"
          >
            {form.isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Locking XLM...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-2" />
                Lock XLM for Purchase
              </>
            )}
          </Button>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <Text variant="small" className="text-blue-700">
              Your XLM will be locked on Stellar and the bridge operator will execute the tree
              purchase on your behalf. The bridge fee is deducted from the locked amount.
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}
