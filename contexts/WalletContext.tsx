'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useWallet } from '@/hooks/useWallet';
import type { WalletContextValue } from '@/lib/types/wallet';

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const walletHook = useWallet();
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedRef.current && typeof window !== 'undefined') {
      walletHook.loadPersistedConnection();
      hasLoadedRef.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <WalletContext.Provider value={walletHook}>{children}</WalletContext.Provider>;
}

export function useWalletContext(): WalletContextValue {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWalletContext must be used within a WalletProvider');
  }
  return context;
}
