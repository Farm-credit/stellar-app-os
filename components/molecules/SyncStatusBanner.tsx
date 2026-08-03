'use client';

import React from 'react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function SyncStatusBanner() {
  const { isOnline, queue, isSyncing, syncError, retrySync } = useOfflineSync();

  // If online, empty queue, and no syncing in progress, don't show the banner.
  if (isOnline && queue.length === 0 && !isSyncing && !syncError) {
    return null;
  }

  const handleRetry = () => {
    retrySync();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md shadow-lg rounded-xl overflow-hidden"
        role="alert"
        aria-live="polite"
      >
        <div className={`p-4 flex items-center justify-between gap-4 border-l-4 backdrop-blur-md ${
          !isOnline 
            ? 'bg-amber-50/90 border-amber-500 text-amber-900 dark:bg-amber-950/90 dark:text-amber-100'
            : isSyncing
            ? 'bg-blue-50/90 border-blue-500 text-blue-900 dark:bg-blue-950/90 dark:text-blue-100'
            : syncError
            ? 'bg-red-50/90 border-red-500 text-red-900 dark:bg-red-950/90 dark:text-red-100'
            : 'bg-green-50/90 border-green-500 text-green-900 dark:bg-green-950/90 dark:text-green-100'
        }`}>
          <div className="flex items-center gap-3">
            {!isOnline && <CloudOff className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
            {isOnline && isSyncing && <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />}
            {isOnline && syncError && <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />}
            {isOnline && !isSyncing && !syncError && queue.length > 0 && (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            )}
            
            <div className="flex flex-col">
              <span className="font-semibold text-sm">
                {!isOnline ? 'You are offline' : isSyncing ? 'Syncing...' : syncError ? 'Sync failed' : 'Ready to sync'}
              </span>
              <span className="text-xs opacity-80">
                {queue.length} photo{queue.length !== 1 ? 's' : ''} pending sync
              </span>
            </div>
          </div>

          {isOnline && queue.length > 0 && !isSyncing && (
            <Button
              size="sm"
              variant={syncError ? 'destructive' : 'default'}
              onClick={handleRetry}
              disabled={isSyncing}
              className="shrink-0 transition-all active:scale-95"
            >
              {syncError ? 'Retry' : 'Sync Now'}
            </Button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
