'use client';

import { JSX, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, Home, BookOpen, ShoppingCart, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { useWalletContext } from '@/contexts/WalletContext';
import { LanguageSelector } from '@/components/organisms/Header/LanguageSelector';
import { useAppTranslation } from '@/hooks/useTranslation';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavLink {
  href: string;
  labelKey: keyof { 'nav.home': string; 'nav.blog': string; 'nav.purchaseCredits': string; 'nav.dashboard': string };
  icon: React.ComponentType<{ className?: string }>;
}

// Only hrefs and icons here — labels come from t() inside the component
const NAV_LINKS: NavLink[] = [
  { href: '/', labelKey: 'nav.home', icon: Home },
  { href: '/blog', labelKey: 'nav.blog', icon: BookOpen },
  { href: '/credits/purchase', labelKey: 'nav.purchaseCredits', icon: ShoppingCart },
  { href: '/dashboard/credits', labelKey: 'nav.dashboard', icon: LayoutDashboard },
];

export function MobileDrawer({ isOpen, onClose }: MobileDrawerProps): JSX.Element {
  const pathname = usePathname();
  const { wallet, connect, disconnect } = useWalletContext();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { t } = useAppTranslation();

  const handleWalletAction = async (): Promise<void> => {
    if (wallet?.publicKey) {
      disconnect();
    } else {
      await connect('freighter');
    }
    onClose();
  };

  const handleLinkClick = (): void => {
    onClose();
  };

  // Trap focus within drawer when open
  useEffect(() => {
    if (!isOpen) return;

    const drawer = drawerRef.current;
    if (!drawer) return;

    closeButtonRef.current?.focus();

    const focusableElements = drawer.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    drawer.addEventListener('keydown', handleTabKey);
    return () => drawer.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

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

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed top-0 left-0 z-50 h-full w-[280px] bg-background border-r border-border shadow-xl transform transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={t('header.openMenu')}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Text variant="h3" className="font-bold text-stellar-blue">
            FarmCredit
          </Text>
          <button
            ref={closeButtonRef}
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-muted hover:text-stellar-blue focus:outline-none focus:ring-2 focus:ring-inset focus:ring-stellar-blue transition-colors"
            onClick={onClose}
            aria-label={t('mobile.closeMenu')}
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-col p-4 space-y-2" aria-label="Main navigation">
          {NAV_LINKS.map(({ href, labelKey, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={handleLinkClick}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-stellar-blue/10 text-stellar-blue'
                    : 'text-foreground hover:bg-muted hover:text-stellar-blue'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
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
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-background">
          <Button
            variant={wallet?.publicKey ? 'outline' : 'default'}
            size="lg"
            className="w-full"
            onClick={handleWalletAction}
          >
            {wallet?.publicKey
              ? `${wallet.publicKey.slice(0, 4)}...${wallet.publicKey.slice(-4)}`
              : t('header.connectWallet')}
          </Button>
          {wallet?.publicKey && (
            <Text variant="muted" className="text-xs text-center mt-2">
              {t('mobile.tapToDisconnect')}
            </Text>
          )}
        </div>
      </div>
    </>
  );
}