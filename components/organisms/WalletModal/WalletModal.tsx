'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, HelpCircle, Loader2, Wallet } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card } from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import { useWalletContext } from '@/contexts/WalletContext';
import { isFreighterInstalled } from '@/lib/stellar/wallet';
import type { WalletType } from '@/lib/types/wallet';
import { cn } from '@/lib/utils';

const WALLET_ICONS: Record<WalletType, React.ReactNode> = {
  freighter: (
    <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="2" className="fill-current text-stellar-blue" />
      <path d="M8 9h8M8 15h8" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  albedo: (
    <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" className="fill-current text-stellar-purple" />
      <path d="M8 12h8M12 8v8" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  custodial: <Wallet className="h-12 w-12 text-stellar-navy" />,
};

const WALLET_NAMES: Record<WalletType, string> = {
  freighter: 'Freighter',
  albedo: 'Albedo',
  custodial: 'Custodial',
};

const WALLET_DESCRIPTIONS: Record<WalletType, string> = {
  freighter: 'Browser extension for Stellar wallet management.',
  albedo: 'Web-based wallet with no extension required.',
  custodial: 'Not currently supported.',
};

interface WalletModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ConnectionError {
  message: string;
  type: 'error' | 'warning';
}

export function WalletModal({ isOpen, onOpenChange, onSuccess }: WalletModalProps) {
  const { connect, isLoading: contextLoading, error: contextError } = useWalletContext();
  const [connectingWallet, setConnectingWallet] = useState<WalletType | null>(null);
  const [freighterInstalled, setFreighterInstalled] = useState(false);
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConnectingWallet(null);
      setConnectionError(null);
      setShowSuccess(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const checkFreighter = async () => {
      try {
        const installed = await isFreighterInstalled();
        setFreighterInstalled(installed);
      } catch {
        setFreighterInstalled(false);
      }
    };

    checkFreighter();
  }, []);

  const handleWalletConnect = useCallback(
    async (walletType: WalletType) => {
      if (walletType === 'custodial') {
        setConnectionError({
          message: 'Custodial wallets are not currently supported.',
          type: 'warning',
        });
        return;
      }

      setConnectingWallet(walletType);
      setConnectionError(null);

      try {
        await connect();
        setShowSuccess(true);
        setTimeout(() => {
          onOpenChange(false);
          onSuccess?.();
        }, 1500);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect wallet';
        setConnectionError({
          message:
            message === 'Connection rejected by user'
              ? 'You cancelled the wallet connection. Please try again if you want to connect.'
              : message === 'Popup blocked. Please allow popups for this site.'
                ? 'Popups are blocked. Please check your browser settings and try again.'
                : message,
          type: 'error',
        });
      } finally {
        setConnectingWallet(null);
      }
    },
    [connect, onOpenChange, onSuccess]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open || !contextLoading) {
        onOpenChange(open);
      }
    },
    [onOpenChange, contextLoading]
  );

  const handleHelpClick = useCallback(() => {
    const helpUrl = 'https://developers.stellar.org/docs/build/guides/wallets/intro-to-wallets';
    window.open(helpUrl, '_blank', 'noopener,noreferrer');
  }, []);

  useEffect(() => {
    if (isOpen && contextError) {
      setConnectionError({
        message: contextError,
        type: 'error',
      });
    }
  }, [isOpen, contextError]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md border-stellar-navy/20 bg-stellar-navy sm:rounded-lg"
        aria-label="Connect Wallet"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">Connect Your Wallet</DialogTitle>
          <DialogDescription className="text-white/70">
            Choose a wallet to get started with Stellar.
          </DialogDescription>
        </DialogHeader>

        {showSuccess ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <div className="rounded-full bg-stellar-green/20 p-3">
              <CheckCircle className="h-8 w-8 text-stellar-green" />
            </div>
            <div className="text-center">
              <Text variant="h4" as="p" className="font-semibold text-white">
                Connected!
              </Text>
              <Text variant="small" as="p" className="text-white/70">
                Your wallet is ready to use.
              </Text>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {connectionError && (
              <div
                className={cn(
                  'flex items-start gap-3 rounded-lg p-3',
                  connectionError.type === 'error'
                    ? 'bg-red-900/20 text-red-200'
                    : 'bg-yellow-900/20 text-yellow-200'
                )}
                role="alert"
                aria-live="polite"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <Text variant="small" as="p" className="flex-1">
                  {connectionError.message}
                </Text>
              </div>
            )}

            <div className="space-y-3">
              {(['freighter', 'albedo'] as const).map((walletType) => {
                const isFreighterNotInstalled = walletType === 'freighter' && !freighterInstalled;

                return (
                  <WalletOptionCard
                    key={walletType}
                    walletType={walletType}
                    icon={WALLET_ICONS[walletType]}
                    name={WALLET_NAMES[walletType]}
                    description={WALLET_DESCRIPTIONS[walletType]}
                    isLoading={connectingWallet === walletType && contextLoading}
                    disabled={isFreighterNotInstalled}
                    onClick={() => handleWalletConnect(walletType)}
                    installUrl={walletType === 'freighter' ? 'https://freighter.app' : undefined}
                  />
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-2 border-t border-white/10 pt-4">
              <HelpCircle className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
              <button
                onClick={handleHelpClick}
                type="button"
                className="text-sm text-stellar-blue hover:underline focus:outline-none focus:ring-2 focus:ring-stellar-blue/50 rounded px-2 py-1"
                aria-label="Learn what a wallet is"
              >
                What is a wallet?
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface WalletOptionCardProps {
  walletType: WalletType;
  icon: React.ReactNode;
  name: string;
  description: string;
  isLoading: boolean;
  disabled?: boolean;
  onClick: () => void;
  installUrl?: string;
}

function WalletOptionCard({
  _walletType,
  icon,
  name,
  description,
  isLoading,
  disabled,
  onClick,
  installUrl,
}: WalletOptionCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer border-white/10 bg-stellar-navy/40 transition-all hover:bg-stellar-blue/10 hover:border-stellar-blue/30',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-stellar-navy/40 hover:border-white/10'
      )}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onClick()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-disabled={disabled}
    >
      <div className="flex items-center gap-4 p-4">
        <div className="flex-shrink-0">{icon}</div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">{name}</h3>
          <p className="text-sm text-white/70">{description}</p>
          {disabled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (installUrl) window.open(installUrl, '_blank', 'noopener,noreferrer');
              }}
              type="button"
              className="mt-2 text-xs text-stellar-blue hover:underline focus:outline-none focus:ring-2 focus:ring-stellar-blue/50 rounded px-2 py-1"
            >
              Install Extension
            </button>
          )}
        </div>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-stellar-blue" aria-hidden="true" />
        ) : (
          <div
            className="flex-shrink-0 rounded-full border-2 border-white/20 p-2 transition-colors hover:border-stellar-blue/50"
            aria-hidden="true"
          >
            <svg
              className="h-4 w-4 text-white/50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}
      </div>
    </Card>
  );
}
