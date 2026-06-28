'use client';

import { type JSX, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, Home, FolderOpen, ShoppingBag, LayoutDashboard, History } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { useWalletContext } from '@/contexts/WalletContext';
import { LanguageSelector } from '@/components/organisms/Header/LanguageSelector';
import { useAppTranslation } from '@/hooks/useTranslation';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when the user taps "Connect Wallet" — opens the WalletModal */
  onOpenWallet: () => void;
}

const NAV_LINKS = [
  { href: '/', labelKey: 'nav.home', icon: Home },
  { href: '/projects', labelKey: 'nav.projects', icon: FolderOpen },
  { href: '/marketplace', labelKey: 'nav.marketplace', icon: ShoppingBag },
  { href: '/transactions', labelKey: 'nav.transactions', icon: History },
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
] as const;

export function MobileDrawer({ isOpen, onClose, onOpenWallet }: MobileDrawerProps): JSX.Element {
  const pathname = usePathname();
  const { wallet, disconnect } = useWalletContext();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { t } = useAppTranslation();

  const handleWalletAction = (): void => {
    if (wallet?.publicKey) {
      disconnect();
    } else {
      onClose();
      onOpenWallet();
    }
  };

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();

    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusable = drawer.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleTab = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    drawer.addEventListener('keydown', handleTab);
    return () => drawer.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const walletLabel = wallet?.publicKey
    ? `${wallet.publicKey.slice(0, 6)}…${wallet.publicKey.slice(-4)}`
    : t('header.connectWallet');

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer — slides from the RIGHT */}
      <div
        id="mobile-nav"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        className={`fixed top-0 right-0 z-50 h-full w-[280px] bg-stellar-navy border-l border-border shadow-xl transform transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Text variant="h3" className="font-bold text-stellar-blue">
            FarmCredit
          </Text>
          <button
            ref={closeButtonRef}
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-stellar-blue transition-colors"
            onClick={onClose}
            aria-label={t('mobile.closeMenu')}
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation */}
        <nav
          className="flex flex-col p-4 space-y-1"
          role="navigation"
          aria-label="Mobile main navigation"
        >
          {NAV_LINKS.map(({ href, labelKey, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue ${
                  isActive
                    ? 'bg-stellar-blue/10 text-stellar-blue'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{t(labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/* Language Selector */}
        <div className="px-4 py-2 border-t border-border">
          <LanguageSelector variant="mobile" />
        </div>

        {/* Wallet Section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-stellar-navy">
          <Button
            variant={wallet?.publicKey ? 'outline' : 'default'}
            size="lg"
            className="w-full font-mono"
            onClick={handleWalletAction}
          >
            {walletLabel}
          </Button>
          {wallet?.publicKey && (
            <Text variant="muted" className="text-xs text-center mt-2 text-white/50">
              {t('mobile.tapToDisconnect')}
            </Text>
          )}
        </div>
      </div>
    </>
  );
}
