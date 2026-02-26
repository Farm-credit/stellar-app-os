'use client';

import { useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, Wallet } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner/LoadingSpinner';
import { WalletModal } from '@/components/organisms/WalletModal/WalletModal';
import { formatCurrency } from '@/lib/constants/donation';
import type { WalletConnection } from '@/lib/types/wallet';
import type { TransactionStatus } from '@/lib/types/payment';

interface StellarPaymentSectionProps {
  amount: number;
  wallet: WalletConnection | null;
  status: TransactionStatus;
  error: string | null;
  onPay: () => void;
  onResetError: () => void;
  disabled?: boolean;
}

const STATUS_MESSAGES: Partial<Record<TransactionStatus, string>> = {
  preparing: 'Building transaction...',
  signing: 'Awaiting wallet signature...',
  submitting: 'Submitting to network...',
  confirming: 'Confirming transaction...',
};

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function StellarPaymentSection({
  amount,
  wallet,
  status,
  error,
  onPay,
  onResetError,
  disabled,
}: StellarPaymentSectionProps) {
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const isProcessing = ['preparing', 'signing', 'submitting', 'confirming'].includes(status);
  const usdcBalance = wallet ? parseFloat(wallet.balance.usdc) : 0;
  const hasInsufficientBalance = wallet !== null && usdcBalance < amount;

  const handleWalletConnected = useCallback(() => {
    setWalletModalOpen(false);
  }, []);

  // Wallet not connected
  if (!wallet) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-muted/20 p-6 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-stellar-blue/10">
            <Wallet className="h-7 w-7 text-stellar-blue" aria-hidden="true" />
          </div>
          <div>
            <Text variant="body" className="font-semibold">
              Connect your Stellar wallet
            </Text>
            <Text variant="muted" className="mt-1">
              Pay with USDC on the Stellar network
            </Text>
          </div>
          <Button
            type="button"
            size="lg"
            stellar="primary"
            width="full"
            onClick={() => setWalletModalOpen(true)}
            disabled={disabled}
            aria-label="Connect your Stellar wallet"
          >
            <Wallet className="mr-2 h-4 w-4" aria-hidden="true" />
            Connect Wallet
          </Button>
        </div>

        <WalletModal
          isOpen={walletModalOpen}
          onOpenChange={setWalletModalOpen}
          onSuccess={handleWalletConnected}
        />
      </div>
    );
  }

  // Wallet connected
  return (
    <div className="space-y-6">
      {/* Wallet Info */}
      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-stellar-green" aria-hidden="true" />
            <Text variant="small" className="font-medium">
              Wallet Connected
            </Text>
          </div>
          <Badge variant="outline" className="text-xs">
            {wallet.network}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <Text variant="small" className="text-muted-foreground font-mono">
            {truncateAddress(wallet.publicKey)}
          </Text>
          <Text variant="small" className="font-medium">
            {parseFloat(wallet.balance.usdc).toFixed(2)} USDC
          </Text>
        </div>
      </div>

      {/* Insufficient Balance Warning */}
      {hasInsufficientBalance && (
        <div
          className="flex items-start gap-3 rounded-lg bg-yellow-500/10 p-4"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div className="flex-1">
            <Text variant="small" className="font-medium text-yellow-600 dark:text-yellow-400">
              Insufficient USDC balance
            </Text>
            <Text variant="small" className="text-yellow-600/80 dark:text-yellow-400/80">
              You have {usdcBalance.toFixed(2)} USDC but need {amount.toFixed(2)} USDC.
            </Text>
          </div>
        </div>
      )}

      {/* Processing Status */}
      {isProcessing && (
        <div className="flex items-center gap-3 rounded-lg bg-stellar-blue/10 p-4">
          <LoadingSpinner size="sm" />
          <Text variant="body" className="text-stellar-blue font-medium">
            {STATUS_MESSAGES[status] || 'Processing...'}
          </Text>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4" role="alert">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
            <div className="flex-1">
              <Text variant="small" className="font-medium text-destructive">
                Payment failed
              </Text>
              <Text variant="small" className="text-destructive/80">
                {error}
              </Text>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetError}
            disabled={disabled}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Pay Button */}
      <Button
        type="button"
        size="lg"
        stellar="primary"
        width="full"
        onClick={onPay}
        disabled={disabled || isProcessing || hasInsufficientBalance}
        aria-label={`Pay ${formatCurrency(amount)} with Stellar`}
      >
        {isProcessing ? (
          <span className="flex items-center gap-2">
            <LoadingSpinner size="xs" />
            Processing...
          </span>
        ) : (
          <>
            <Wallet className="mr-2 h-4 w-4" aria-hidden="true" />
            Pay {formatCurrency(amount)} with Stellar
          </>
        )}
      </Button>

      <WalletModal
        isOpen={walletModalOpen}
        onOpenChange={setWalletModalOpen}
        onSuccess={handleWalletConnected}
      />
    </div>
  );
}
