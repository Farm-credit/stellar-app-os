'use client';

import * as React from 'react';
import { registerServiceWorker } from '@/lib/pwa';
import { InstallPrompt } from '@/components/atoms/InstallPrompt';
import { NetworkStatus } from '@/components/atoms/NetworkStatus';

export function PWAProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <>
      {children}
      <InstallPrompt />
      <NetworkStatus />
    </>
  );
}
