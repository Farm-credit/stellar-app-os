'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { MobileDrawer } from './MobileDrawer';
import { useWalletContext } from '@/contexts/WalletContext';
import { ThemeToggle } from './ThemeToggle';
import { headerNavLinks, type HeaderNavLink } from './navLinks';

export function Header() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const pathname = usePathname();
  const { wallet, connect, disconnect } = useWalletContext();

  const handleWalletAction = async () => {
    if (wallet?.publicKey) {
      disconnect();
    } else {
      await connect('freighter');
    }
  };

  const getIsActive = ({ href, matchPrefix }: HeaderNavLink): boolean => {
    if (href === '/') return pathname === '/';
    if (matchPrefix) return pathname.startsWith(matchPrefix);
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const walletButtonLabel = wallet?.publicKey
    ? `${wallet.publicKey.slice(0, 6)}...${wallet.publicKey.slice(-4)}`
    : 'Connect Wallet';

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-white/15 bg-stellar-navy/95 text-white backdrop-blur supports-[backdrop-filter]:bg-stellar-navy/85">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center space-x-2 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
          >
            <Text variant="h3" className="font-bold text-stellar-blue">
              FarmCredit
            </Text>
          </Link>

          <nav
            role="navigation"
            aria-label="Primary"
            className="hidden items-center space-x-2 md:flex"
          >
            {headerNavLinks.map((link) => {
              const isActive = getIsActive(link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue ${
                    isActive
                      ? 'bg-stellar-blue/20 text-stellar-blue'
                      : 'text-white/90 hover:bg-white/10 hover:text-stellar-blue'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            <Button
              variant={wallet?.publicKey ? 'outline' : 'default'}
              size="sm"
              className={`max-w-40 transition-colors focus-visible:ring-2 focus-visible:ring-stellar-blue ${
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
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-white hover:bg-white/10 hover:text-stellar-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stellar-blue transition-colors"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isDrawerOpen}
              aria-controls="mobile-nav-drawer"
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

      <noscript>
        <nav
          role="navigation"
          aria-label="Primary no-javascript navigation"
          className="border-b border-white/15 bg-stellar-navy px-4 py-3 text-white md:hidden"
        >
          <ul className="flex flex-wrap items-center gap-3 text-sm">
            {headerNavLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="underline-offset-4 hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </noscript>
    </>
  );
}
