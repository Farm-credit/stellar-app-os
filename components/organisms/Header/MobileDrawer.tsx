'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, Home, FolderKanban, Store, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { useWalletContext } from '@/contexts/WalletContext';
import { headerNavLinks } from './navLinks';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string;
}

const navLinks: NavLink[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/marketplace', label: 'Marketplace', icon: Store },
  {
    href: '/dashboard/credits',
    label: 'Dashboard',
    icon: LayoutDashboard,
    matchPrefix: '/dashboard',
  },
];

export function MobileDrawer({ isOpen, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const { wallet, connect, disconnect } = useWalletContext();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const walletButtonLabel = wallet?.publicKey
    ? `${wallet.publicKey.slice(0, 6)}...${wallet.publicKey.slice(-4)}`
    : 'Connect Wallet';

  const getIsActive = (href: string, matchPrefix?: string): boolean => {
    if (href === '/') return pathname === '/';
    if (matchPrefix) return pathname.startsWith(matchPrefix);
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Handle wallet action
  const handleWalletAction = async () => {
    if (wallet?.publicKey) {
      disconnect();
    } else {
      await connect('freighter');
    }
    onClose();
  };

  // Handle link click
  const handleLinkClick = () => {
    onClose();
  };

  // Trap focus within drawer when open
  useEffect(() => {
    if (!isOpen) return;

    const drawer = drawerRef.current;
    if (!drawer) return;

    // Focus close button when drawer opens
    closeButtonRef.current?.focus();

    const focusableElements = drawer.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
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

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

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
        id="mobile-nav-drawer"
        className={`fixed top-0 left-0 z-50 h-full w-[280px] bg-background border-r border-border shadow-xl transform transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation menu"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/15 bg-stellar-navy p-4 text-white">
          <Text variant="h3" className="font-bold text-stellar-blue">
            FarmCredit
          </Text>
          <button
            ref={closeButtonRef}
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-white hover:bg-white/10 hover:text-stellar-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stellar-blue transition-colors"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav
          role="navigation"
          className="flex flex-col p-4 space-y-2"
          aria-label="Primary mobile navigation"
        >
          {navLinks.map(({ href, label, icon: Icon }) => {
            const linkedNav = headerNavLinks.find((navItem) => navItem.href === href);
            const isActive = getIsActive(href, linkedNav?.matchPrefix);
            return (
              <Link
                key={href}
                href={href}
                onClick={handleLinkClick}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-stellar-blue/10 text-stellar-blue'
                    : 'text-foreground hover:bg-muted hover:text-stellar-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Wallet Section */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/15 bg-stellar-navy p-4">
          <Button
            variant={wallet?.publicKey ? 'outline' : 'default'}
            size="lg"
            className={`w-full ${
              wallet?.publicKey
                ? 'border-white/30 bg-transparent text-white hover:bg-white/10'
                : 'bg-stellar-blue text-stellar-navy hover:bg-stellar-blue/90'
            }`}
            onClick={handleWalletAction}
            aria-label={wallet?.publicKey ? 'Disconnect wallet' : 'Connect wallet'}
            title={wallet?.publicKey ? wallet.publicKey : 'Connect wallet'}
          >
            <span className="truncate">{walletButtonLabel}</span>
          </Button>
          {wallet?.publicKey && (
            <Text variant="muted" className="mt-2 text-center text-xs text-white/70">
              Tap to disconnect
            </Text>
          )}
        </div>
      </div>
    </>
  );
}
