'use client';

import { useState, useEffect, useCallback } from 'react';
import type { QueuedUpload, OfflineUploadQueue } from '@/lib/types/offline-upload';

const STORAGE_KEY = 'offline_upload_queue';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export function useOfflineUploadQueue() {
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load queue from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as OfflineUploadQueue;
        setQueue(parsed.items);
      }
    } catch (err) {
      console.error('Failed to load upload queue:', err);
    }
  }, []);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    try {
      const data: OfflineUploadQueue = { items: queue };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save upload queue:', err);
    }
  }, [queue]);

  // Network connectivity detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0 && !isSyncing) {
      syncQueue();
    }
  }, [isOnline, queue.length, isSyncing]);

  // Add a file to the queue
  const addToQueue = useCallback(async (file: File): Promise<string> => {
    const reader = new FileReader();

    return await new Promise((resolve, reject) => {
      reader.onload = () => {
        try {
          const base64 = reader.result as string;
          const upload: QueuedUpload = {
            id: crypto.randomUUID(),
            file: {
              name: file.name,
              type: file.type,
              size: file.size,
              data: base64,
            },
            timestamp: Date.now(),
            status: 'pending',
            retryCount: 0,
          };
          
          setQueue((prev) => [...prev, upload]);
          resolve(upload.id);
        } catch (err) {
          reject(err);
        }
      };
      
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }, []);

  // Remove an item from the queue
  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Update item status
  const updateItemStatus = useCallback((id: string, status: QueuedUpload['status'], error?: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status, error, retryCount: status === 'failed' ? item.retryCount + 1 : item.retryCount }
          : item
      )
    );
  }, []);

  // Sync queued uploads
  const syncQueue = useCallback(async () => {
    if (!isOnline || isSyncing) return;

    const pendingItems = queue.filter((item) => item.status === 'pending' || (item.status === 'failed' && item.retryCount < MAX_RETRIES));
    
    if (pendingItems.length === 0) return;

    setIsSyncing(true);

    for (const item of pendingItems) {
      try {
        updateItemStatus(item.id, 'uploading');

        // Convert base64 back to Blob
        const response = await fetch(item.file.data);
        const blob = await response.blob();
        const file = new File([blob], item.file.name, { type: item.file.type });

        const formData = new FormData();
        formData.append('photo', file);

        const res = await fetch('/api/planters/upload-photo', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          throw new Error('Upload failed');
        }

        const { cid } = await res.json();
        
        // Remove successfully uploaded item
        removeFromQueue(item.id);
      } catch (err) {
        updateItemStatus(item.id, 'failed', err instanceof Error ? err.message : 'Unknown error');
      }
    }

    setIsSyncing(false);
  }, [isOnline, isSyncing, queue, updateItemStatus, removeFromQueue]);

  // Manual sync trigger
  const manualSync = useCallback(() => {
    if (isOnline) {
      syncQueue();
    }
  }, [isOnline, syncQueue]);

  // Clear failed items
  const clearFailed = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status !== 'failed'));
  }, []);

  return {
    queue,
    isOnline,
    isSyncing,
    addToQueue,
    removeFromQueue,
    manualSync,
    clearFailed,
    pendingCount: queue.filter((item) => item.status === 'pending').length,
    failedCount: queue.filter((item) => item.status === 'failed').length,
  };
}
