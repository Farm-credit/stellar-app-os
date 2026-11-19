import { useState, useEffect, useCallback } from 'react';

export interface OfflineQueueItem {
  id: string;
  type: string;
  payload: any;
  createdAt: number;
}

const QUEUE_STORAGE_KEY = 'stellar_offline_sync_queue';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Initialize online status and queue
  useEffect(() => {
    // Only run on client
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);

      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      try {
        const storedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
        if (storedQueue) {
          setQueue(JSON.parse(storedQueue));
        }
      } catch (err) {
        console.error('Failed to load offline queue:', err);
      }

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  const addToQueue = useCallback((item: Omit<OfflineQueueItem, 'id' | 'createdAt'>) => {
    const newItem: OfflineQueueItem = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };

    setQueue((prevQueue) => {
      const updatedQueue = [...prevQueue, newItem];
      try {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
      } catch (err) {
        console.error('Failed to save to offline queue:', err);
      }
      return updatedQueue;
    });
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prevQueue) => {
      const updatedQueue = prevQueue.filter((item) => item.id !== id);
      try {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
      } catch (err) {
        console.error('Failed to update offline queue:', err);
      }
      return updatedQueue;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    try {
      localStorage.removeItem(QUEUE_STORAGE_KEY);
    } catch (err) {
      console.error('Failed to clear offline queue:', err);
    }
  }, []);

  const retrySync = useCallback(async (processItem?: (item: OfflineQueueItem) => Promise<boolean>) => {
    if (!isOnline || queue.length === 0 || isSyncing) return;

    setIsSyncing(true);
    setSyncError(null);

    let itemsToProcess = [...queue];
    let hasError = false;

    for (const item of itemsToProcess) {
      try {
        // If a processor function is provided, use it. Otherwise, simulate sync.
        let success = true;
        if (processItem) {
          success = await processItem(item);
        } else {
          // Default behavior: just simulate a network request if no handler provided
          await new Promise(resolve => setTimeout(resolve, 800));
        }

        if (success) {
          removeFromQueue(item.id);
        } else {
          hasError = true;
          break; // Stop syncing on first failure
        }
      } catch (err) {
        console.error(`Failed to sync item ${item.id}:`, err);
        setSyncError('Sync failed. Will retry later.');
        hasError = true;
        break; // Stop syncing on error
      }
    }

    setIsSyncing(false);
  }, [isOnline, queue, isSyncing, removeFromQueue]);

  return {
    isOnline,
    queue,
    isSyncing,
    syncError,
    addToQueue,
    removeFromQueue,
    clearQueue,
    retrySync,
  };
}
