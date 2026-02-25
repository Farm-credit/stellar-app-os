'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { MobileDrawer } from './MobileDrawer';
import { useWalletContext } from '@/contexts/WalletContext';

export function Header() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { wallet, connect, disconnect } = useWalletContext();

  const handleWalletAction = async () => {
    if (wallet?.publicKey) {
      disconnect();
    } else {
      await connect('freighter');
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <Text variant="h3" className="font-bold text-stellar-blue">
              FarmCredit
            </Text>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link
              href="/"
              className="text-sm font-medium transition-colors hover:text-stellar-blue"
            >
              Home
            </Link>
            <Link
              href="/blog"
              className="text-sm font-medium transition-colors hover:text-stellar-blue"
            >
              Blog
            </Link>
            <Link
              href="/credits/purchase"
              className="text-sm font-medium transition-colors hover:text-stellar-blue"
            >
              Purchase Credits
            </Link>
            <Link
              href="/dashboard/credits"
              className="text-sm font-medium transition-colors hover:text-stellar-blue"
            >
              Dashboard
            </Link>
          </nav>

          {/* Desktop Wallet Button */}
          <div className="hidden md:block">
            <Button
              variant={wallet?.publicKey ? 'outline' : 'default'}
              size="sm"
              onClick={handleWalletAction}
            >
              {wallet?.publicKey
                ? `${wallet.publicKey.slice(0, 4)}...${wallet.publicKey.slice(-4)}`
                : 'Connect Wallet'}
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-muted hover:text-stellar-blue focus:outline-none focus:ring-2 focus:ring-inset focus:ring-stellar-blue transition-colors"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={isDrawerOpen}
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      <MobileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}
