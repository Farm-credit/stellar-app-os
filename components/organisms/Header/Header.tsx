'use client';

import { type JSX, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { MobileDrawer } from '@/components/organisms/Header/MobileDrawer';
import { LanguageSelector } from '@/components/organisms/Header/LanguageSelector';
import { WalletModal } from '@/components/organisms/WalletModal/WalletModal';
import { useWalletModal } from '@/components/organisms/WalletModal/useWalletModal';
import { useWalletContext } from '@/contexts/WalletContext';
import { useAppTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'nav.home' },
  { href: '/projects', label: 'nav.projects' },
  { href: '/marketplace', label: 'nav.marketplace' },
  { href: '/dashboard', label: 'nav.dashboard' },
] as const;

export function Header(): JSX.Element {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  const pathname = usePathname();
  const { wallet, disconnect } = useWalletContext();
  const { t } = useAppTranslation();
  const { isOpen: isWalletOpen, open: openWallet, close: closeWallet } = useWalletModal();

  // Sticky shadow on scroll
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 0);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Theme toggle — applies .dark class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const handleWalletAction = (): void => {
    if (wallet?.publicKey) {
      disconnect();
    } else {
      openWallet();
    }
  };

  const walletLabel = wallet?.publicKey
    ? `${wallet.publicKey.slice(0, 6)}…${wallet.publicKey.slice(-4)}`
    : t('header.connectWallet');

  return (
    <>
      <header
        role="banner"
        className={cn(
          'sticky top-0 z-40 w-full border-b border-border',
          'bg-stellar-navy/95 backdrop-blur supports-[backdrop-filter]:bg-stellar-navy/60',
          'transition-shadow duration-200',
          isScrolled && 'shadow-lg shadow-black/30'
        )}
      >
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* ── Logo ── */}
          <Link
            href="/"
            className="flex items-center space-x-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue rounded-sm"
            aria-label="FarmCredit home"
          >
            <Text variant="h3" className="font-bold text-stellar-blue">
              FarmCredit
            </Text>
          </Link>

          {/* ── Desktop Navigation ── */}
          <nav
            className="hidden md:flex items-center space-x-6"
            role="navigation"
            aria-label="Main navigation"
          >
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative text-sm font-medium transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue rounded-sm px-1 py-0.5',
                    isActive
                      ? 'text-stellar-blue after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-full after:rounded-full after:bg-stellar-blue after:content-[""]'
                      : 'text-white/70 hover:text-white'
                  )}
                >
                  {t(label)}
                </Link>
              );
            })}
          </nav>

          {/* ── Desktop Right Controls ── */}
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <LanguageSelector variant="desktop" />

            {wallet?.isConnected && (
              <div className="flex items-center gap-3 mr-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-stellar-blue uppercase tracking-wider">XLM</span>
                    <span className="text-xs font-mono font-bold text-white">
                      {parseFloat(wallet.balance.xlm).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-stellar-cyan uppercase tracking-wider">USDC</span>
                    <span className="text-xs font-mono font-bold text-white">
                      {parseFloat(wallet.balance.usdc).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <Button
              variant={wallet?.publicKey ? 'outline' : 'default'}
              size="sm"
              onClick={handleWalletAction}
              aria-label={
                wallet?.publicKey
                  ? `Wallet connected: ${wallet.publicKey}. Click to disconnect.`
                  : 'Connect your Stellar wallet'
              }
              className="font-mono border-white/20 hover:border-stellar-blue/50"
            >
              {walletLabel}
            </Button>
          </div>

          {/* ── Mobile Controls ── */}
          <div className="flex md:hidden items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-stellar-blue transition-colors"
              onClick={() => setIsDrawerOpen(true)}
              aria-label={t('header.openMenu')}
              aria-expanded={isDrawerOpen}
              aria-controls="mobile-nav"
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onOpenWallet={openWallet}
      />

      <WalletModal isOpen={isWalletOpen} onOpenChange={(open) => !open && closeWallet()} />
    </>
  );
}