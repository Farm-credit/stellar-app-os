'use client';

/**
 * WalletModal — Multi-Wallet Selector (#662)
 *
 * Premium connection selector supporting Freighter, Albedo, and xBull.
 * Features:
 *   - Per-wallet loading spinner during the handshake
 *   - "Not installed" warning badge + install link for extension wallets
 *   - Graceful error handling: rejection, popup-blocked, timeout, generic
 *   - Animated success state before auto-closing
 *   - Keyboard navigable, fully accessible (ARIA)
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  HelpCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useWalletContext } from '@/contexts/WalletContext';
import { isFreighterInstalled, isXBullInstalled } from '@/lib/stellar/wallet';
import type { WalletType } from '@/lib/types/wallet';
import { cn } from '@/lib/utils';

// ── Wallet metadata ────────────────────────────────────────────────────────

interface WalletMeta {
  id: WalletType;
  name: string;
  tagline: string;
  type: 'extension' | 'web';
  installUrl?: string;
  /** SVG path data for the wallet logo */
  icon: React.ReactNode;
  accentClass: string;
}

const WALLETS: WalletMeta[] = [
  {
    id: 'freighter',
    name: 'Freighter',
    tagline: 'Browser extension by Stellar Development Foundation',
    type: 'extension',
    installUrl: 'https://freighter.app',
    accentClass: 'border-blue-500/40 hover:border-blue-400/60 hover:bg-blue-500/5',
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="h-9 w-9" aria-hidden="true">
        <rect width="40" height="40" rx="10" fill="#1A56DB" />
        <path
          d="M10 14h20M10 20h14M10 26h18"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'albedo',
    name: 'Albedo',
    tagline: 'Web wallet — no extension required',
    type: 'web',
    accentClass: 'border-purple-500/40 hover:border-purple-400/60 hover:bg-purple-500/5',
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="h-9 w-9" aria-hidden="true">
        <circle cx="20" cy="20" r="20" fill="#7C3AED" />
        <path d="M20 10l8.66 15H11.34L20 10z" fill="white" fillOpacity="0.9" />
        <circle cx="20" cy="27" r="3" fill="white" />
      </svg>
    ),
  },
  {
    id: 'xbull',
    name: 'xBull',
    tagline: 'Browser extension with multi-signature support',
    type: 'extension',
    installUrl: 'https://xbull.app',
    accentClass: 'border-amber-500/40 hover:border-amber-400/60 hover:bg-amber-500/5',
    icon: (
      <svg viewBox="0 0 40 40" fill="none" className="h-9 w-9" aria-hidden="true">
        <rect width="40" height="40" rx="10" fill="#D97706" />
        <path d="M12 12l16 16M28 12L12 28" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

// ── Error classifier ───────────────────────────────────────────────────────

type ErrorKind = 'rejection' | 'popup' | 'timeout' | 'not_installed' | 'generic';

interface ParsedError {
  kind: ErrorKind;
  message: string;
}

function parseConnectionError(err: unknown): ParsedError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes('rejected') ||
    lower.includes('denied') ||
    lower.includes('cancel') ||
    lower.includes('user')
  ) {
    return { kind: 'rejection', message: 'Connection cancelled. Click a wallet to try again.' };
  }
  if (lower.includes('popup') || lower.includes('blocked')) {
    return {
      kind: 'popup',
      message: 'Popups are blocked. Please allow popups for this site and try again.',
    };
  }
  if (lower.includes('timeout')) {
    return { kind: 'timeout', message: 'Connection timed out. Please try again.' };
  }
  if (
    lower.includes('not found') ||
    lower.includes('not installed') ||
    lower.includes('extension')
  ) {
    return { kind: 'not_installed', message: msg };
  }
  return { kind: 'generic', message: msg };
}

// ── Props ──────────────────────────────────────────────────────────────────

interface WalletModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// ── Main modal ─────────────────────────────────────────────────────────────

export function WalletModal({ isOpen, onOpenChange, onSuccess }: WalletModalProps) {
  const { connect, isLoading: contextLoading, error: contextError } = useWalletContext();

  const [connectingWallet, setConnectingWallet] = useState<WalletType | null>(null);
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(null);
  const [xbullInstalled, setXbullInstalled] = useState<boolean | null>(null);
  const [error, setError] = useState<ParsedError | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successWallet, setSuccessWallet] = useState<WalletMeta | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setConnectingWallet(null);
      setError(null);
      setShowSuccess(false);
      setSuccessWallet(null);
    }
  }, [isOpen]);

  // Detect installed extension wallets
  useEffect(() => {
    if (!isOpen) return;
    isFreighterInstalled()
      .then(setFreighterInstalled)
      .catch(() => setFreighterInstalled(false));
    isXBullInstalled()
      .then(setXbullInstalled)
      .catch(() => setXbullInstalled(false));
  }, [isOpen]);

  // Sync context errors
  useEffect(() => {
    if (isOpen && contextError) {
      setError(parseConnectionError(new Error(contextError)));
    }
  }, [isOpen, contextError]);

  const handleConnect = useCallback(
    async (wallet: WalletMeta) => {
      if (connectingWallet || showSuccess) return;

      setConnectingWallet(wallet.id);
      setError(null);

      try {
        await connect(wallet.id);
        setSuccessWallet(wallet);
        setShowSuccess(true);
        setTimeout(() => {
          onOpenChange(false);
          onSuccess?.();
        }, 1400);
      } catch (err) {
        setError(parseConnectionError(err));
      } finally {
        setConnectingWallet(null);
      }
    },
    [connect, connectingWallet, showSuccess, onOpenChange, onSuccess]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      // Prevent closing while a connection handshake is in flight
      if (!open && contextLoading) return;
      onOpenChange(open);
    },
    [onOpenChange, contextLoading]
  );

  function isNotInstalled(wallet: WalletMeta): boolean {
    if (wallet.type !== 'extension') return false;
    if (wallet.id === 'freighter') return freighterInstalled === false;
    if (wallet.id === 'xbull') return xbullInstalled === false;
    return false;
  }

  function isDetecting(wallet: WalletMeta): boolean {
    if (wallet.type !== 'extension') return false;
    if (wallet.id === 'freighter') return freighterInstalled === null;
    if (wallet.id === 'xbull') return xbullInstalled === null;
    return false;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-sm gap-0 overflow-hidden border-white/10 bg-[#0f1117] p-0 shadow-2xl sm:rounded-2xl"
        aria-label="Connect your Stellar wallet"
      >
        {/* Header */}
        <DialogHeader className="border-b border-white/8 px-6 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <ShieldCheck className="h-5 w-5 text-blue-400" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-white">
                Connect Wallet
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-white/50">
                Choose how you want to connect to Stellar
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-4 py-4 space-y-2">
          {/* Success state */}
          {showSuccess && successWallet ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="relative flex items-center justify-center">
                <div
                  className="absolute h-16 w-16 rounded-full bg-green-500/10 animate-ping"
                  aria-hidden="true"
                />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15">
                  <CheckCircle className="h-6 w-6 text-green-400" />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{successWallet.name} connected</p>
                <p className="mt-0.5 text-xs text-white/50">Redirecting you now…</p>
              </div>
            </div>
          ) : (
            <>
              {/* Error banner */}
              {error && (
                <div
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-xs',
                    error.kind === 'rejection'
                      ? 'bg-yellow-500/10 text-yellow-300'
                      : 'bg-red-500/10 text-red-300'
                  )}
                  role="alert"
                  aria-live="polite"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span>{error.message}</span>
                </div>
              )}

              {/* Wallet options */}
              {WALLETS.map((wallet) => {
                const notInstalled = isNotInstalled(wallet);
                const detecting = isDetecting(wallet);
                const loading = connectingWallet === wallet.id && contextLoading;
                const anyConnecting = connectingWallet !== null;

                return (
                  <WalletRow
                    key={wallet.id}
                    wallet={wallet}
                    loading={loading}
                    detecting={detecting}
                    notInstalled={notInstalled}
                    disabled={anyConnecting || showSuccess}
                    onConnect={() => handleConnect(wallet)}
                  />
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        {!showSuccess && (
          <div className="flex items-center justify-center gap-1.5 border-t border-white/8 px-6 py-3">
            <HelpCircle className="h-3.5 w-3.5 text-white/30" aria-hidden="true" />
            <a
              href="https://developers.stellar.org/docs/build/guides/wallets/intro-to-wallets"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              What is a Stellar wallet?
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Wallet row ─────────────────────────────────────────────────────────────

interface WalletRowProps {
  wallet: WalletMeta;
  loading: boolean;
  detecting: boolean;
  notInstalled: boolean;
  disabled: boolean;
  onConnect: () => void;
}

function WalletRow({
  wallet,
  loading,
  detecting,
  notInstalled,
  disabled,
  onConnect,
}: WalletRowProps) {
  const isClickable = !disabled && !notInstalled;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={isClickable ? onConnect : undefined}
        disabled={!isClickable}
        aria-busy={loading}
        aria-label={
          loading
            ? `Connecting to ${wallet.name}…`
            : notInstalled
              ? `${wallet.name} not installed`
              : `Connect with ${wallet.name}`
        }
        className={cn(
          'group relative w-full rounded-xl border bg-white/[0.03] px-4 py-3.5 text-left',
          'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
          isClickable && wallet.accentClass,
          !isClickable && 'cursor-not-allowed opacity-50 border-white/8',
          loading && 'border-blue-500/50 bg-blue-500/5'
        )}
      >
        <div className="flex items-center gap-3.5">
          {/* Icon */}
          <div className="flex-shrink-0">{wallet.icon}</div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">{wallet.name}</span>
              {wallet.type === 'web' && (
                <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                  Web
                </span>
              )}
              {notInstalled && (
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                  Not installed
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-white/40">{wallet.tagline}</p>
          </div>

          {/* Right indicator */}
          <div className="flex-shrink-0">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" aria-hidden="true" />
            ) : detecting ? (
              <Loader2 className="h-4 w-4 animate-spin text-white/20" aria-hidden="true" />
            ) : (
              <svg
                className={cn(
                  'h-4 w-4 transition-transform duration-150',
                  isClickable
                    ? 'text-white/25 group-hover:translate-x-0.5 group-hover:text-white/60'
                    : 'text-white/15'
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Loading progress bar */}
        {loading && (
          <div
            className="absolute bottom-0 left-0 h-[2px] w-full overflow-hidden rounded-b-xl"
            aria-hidden="true"
          >
            <div className="h-full w-1/2 animate-[slide_1.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
          </div>
        )}
      </button>

      {/* Install link for not-installed extension wallets */}
      {notInstalled && wallet.installUrl && (
        <a
          href={wallet.installUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 pl-4 text-xs text-white/35 hover:text-white/60 transition-colors"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          Install {wallet.name}
        </a>
      )}
    </div>
  );
}
