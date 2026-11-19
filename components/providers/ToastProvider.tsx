'use client';

import React, { createContext, useState, useCallback } from 'react';
import { Toast } from '@/components/molecules/Toast';
import { type ToastMessage, type ToastContextType } from '@/types/sharing';

const DEFAULT_TOAST_DURATION = 5000;
const MIN_TOAST_DURATION = 2000;
const MAX_TOAST_DURATION = 10000;

function normalizeToastDuration(duration?: number): number {
  if (duration === undefined || Number.isNaN(duration)) {
    return DEFAULT_TOAST_DURATION;
  }

  if (duration <= 0) {
    return 0;
  }

  return Math.min(Math.max(duration, MIN_TOAST_DURATION), MAX_TOAST_DURATION);
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps): React.ReactElement {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = DEFAULT_TOAST_DURATION) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      const newToast: ToastMessage = {
        id,
        message,
        type,
        duration: normalizeToastDuration(duration),
      };

      setToasts((prevToasts) => [...prevToasts, newToast]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const contextValue: ToastContextType = {
    toasts,
    addToast,
    removeToast,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
