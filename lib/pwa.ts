export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60000); // Check every minute

        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              if (confirm('New version available! Reload to update?')) {
                window.location.reload();
              }
            }
          });
        });
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  });
}

export function unregisterServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }

  return navigator.serviceWorker
    .getRegistration()
    .then((registration) => {
      if (registration) {
        return registration.unregister();
      }
      return false;
    })
    .catch((error) => {
      console.error('Service Worker unregistration failed:', error);
      return false;
    });
}

export async function checkOnlineStatus(): Promise<boolean> {
  if (!navigator.onLine) {
    return false;
  }

  try {
    const response = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-cache',
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function subscribeToNetworkStatus(callback: (isOnline: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
