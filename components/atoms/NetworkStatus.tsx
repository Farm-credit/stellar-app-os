'use client';

import * as React from 'react';
import { Badge } from '@/components/atoms/Badge';
import { subscribeToNetworkStatus } from '@/lib/pwa';

export function NetworkStatus() {
  const [isOnline, setIsOnline] = React.useState<boolean>(true);
  const [showStatus, setShowStatus] = React.useState<boolean>(false);

  React.useEffect(() => {
    setIsOnline(navigator.onLine);

    const unsubscribe = subscribeToNetworkStatus((online) => {
      setIsOnline(online);
      setShowStatus(true);

      // Hide status after 5 seconds
      setTimeout(() => {
        setShowStatus(false);
      }, 5000);
    });

    return unsubscribe;
  }, []);

  if (!showStatus) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2">
      <Badge variant={isOnline ? 'success' : 'destructive'}>
        {isOnline ? 'Back Online' : 'Offline Mode'}
      </Badge>
    </div>
  );
}
