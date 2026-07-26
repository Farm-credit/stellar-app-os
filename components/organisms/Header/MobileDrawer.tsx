'use client';

/**
 * MobileDrawer — Responsive mobile navigation drawer (#666)
 *
 * Replaces CSS transform transitions with framer-motion AnimatePresence
 * for smooth, physics-based slide and fade animations.
 *
 * Animations:
 *   - Drawer:   slides in from the right (x: "100%" → 0) with spring easing
 *   - Backdrop: fades in (opacity: 0 → 0.5) in sync with the drawer
 *   - Nav links: stagger-fade on open so items cascade into view
 *
 * Accessibility (WCAG 2.1 AA):
 *   - Focus trap (Tab / Shift+Tab cycle within drawer)
 *   - Escape key closes the drawer
 *   - Body scroll locked while open
 *   - role="dialog", aria-modal, aria-label on drawer panel
 *   - Auto-focus on close button when drawer opens
 *   - Active page link uses aria-current="page"
 */

import { type JSX, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Home, FolderOpen, ShoppingBag, LayoutDashboard, History } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { useWalletContext } from '@/contexts/WalletContext';
import { LanguageSelector } from '@/components/organisms/Header/LanguageSelector';
import { useAppTranslation } from '@/hooks/useTranslation';

// ── Types ──────────────────────────────────────────────────────────────────

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when the user taps "Connect Wallet" — opens the WalletModal */
  onOpenWallet: () => void;
}

// ── Navigation links ───────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: '/', labelKey: 'nav.home', icon: Home },
  { href: '/projects', labelKey: 'nav.projects', icon: FolderOpen },
  { href: '/marketplace', labelKey: 'nav.marketplace', icon: ShoppingBag },
  { href: '/transactions', labelKey: 'nav.transactions', icon: History },
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
] as const;

// ── Animation variants ─────────────────────────────────────────────────────

/** Backdrop: cross-fade */
const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

/** Drawer panel: spring slide from right */
const drawerVariants = {
  hidden: { x: '100%' },
  visible: {
    x: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 320,
      damping: 32,
      mass: 0.8,
    },
  },
  exit: {
    x: '100%',
    transition: {
      type: 'tween' as const,
      ease: 'easeIn' as const,
      duration: 0.22,
    },
  },
};

/** Nav items: stagger-fade in after the panel arrives */
const navContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const navItemVariants = {
  hidden: { opacity: 0, x: 18 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'tween' as const, ease: 'easeOut' as const, duration: 0.18 },
  },
};

// ── Component ──────────────────────────────────────────────────────────────

export function MobileDrawer({ isOpen, onClose, onOpenWallet }: MobileDrawerProps): JSX.Element {
  const pathname = usePathname();
  const { wallet, disconnect } = useWalletContext();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { t } = useAppTranslation();

  // ── Wallet action ────────────────────────────────────────────────────────
  const handleWalletAction = (): void => {
    if (wallet?.publicKey) {
      disconnect();
    } else {
      onClose();
      onOpenWallet();
    }
  };

  const walletLabel = wallet?.publicKey
    ? `${wallet.publicKey.slice(0, 6)}…${wallet.publicKey.slice(-4)}`
    : t('header.connectWallet');

  // ── Focus trap ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Delay slightly so framer-motion has rendered the panel
    const id = setTimeout(() => closeButtonRef.current?.focus(), 50);

    const drawer = drawerRef.current;
    if (!drawer) return;

    const getFocusable = (): HTMLElement[] =>
      Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );

    const handleTab = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    drawer.addEventListener('keydown', handleTab);
    return () => {
      clearTimeout(id);
      drawer.removeEventListener('keydown', handleTab);
    };
  }, [isOpen]);

  // ── Escape key ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // ── Body scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="mobile-drawer-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.div
            key="mobile-drawer-panel"
            ref={drawerRef}
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            className="fixed top-0 right-0 z-50 flex h-full w-[280px] flex-col bg-stellar-navy border-l border-border shadow-2xl md:hidden"
          >
            {/* ── Header ─────────────────────────────────────────────── */}
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

            {/* ── Navigation ─────────────────────────────────────────── */}
            <motion.nav
              variants={navContainerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col p-4 space-y-1 flex-1 overflow-y-auto"
              role="navigation"
              aria-label="Mobile main navigation"
            >
              {NAV_LINKS.map(({ href, labelKey, icon: Icon }) => {
                const isActive = pathname === href;
                return (
                  <motion.div key={href} variants={navItemVariants}>
                    <Link
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
                      {isActive && (
                        <span
                          className="ml-auto h-1.5 w-1.5 rounded-full bg-stellar-blue"
                          aria-hidden="true"
                        />
                      )}
                    </Link>
                  </motion.div>
                );
              })}
            </motion.nav>

            {/* ── Language selector ───────────────────────────────────── */}
            <div className="px-4 py-3 border-t border-border">
              <LanguageSelector variant="mobile" />
            </div>

            {/* ── Wallet section ──────────────────────────────────────── */}
            <div className="p-4 border-t border-border">
              <Button
                variant={wallet?.publicKey ? 'outline' : 'default'}
                size="lg"
                className="w-full font-mono"
                onClick={handleWalletAction}
                aria-label={
                  wallet?.publicKey
                    ? `Wallet: ${wallet.publicKey}. Tap to disconnect.`
                    : 'Connect your Stellar wallet'
                }
              >
                {walletLabel}
              </Button>
              {wallet?.publicKey && (
                <Text variant="muted" className="text-xs text-center mt-2 text-white/50">
                  {t('mobile.tapToDisconnect')}
                </Text>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
