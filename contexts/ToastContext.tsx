'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'contract';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number; // duration in ms, defaults to 5000
  action?: ToastAction;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
  toast: {
    info: (title: string, description?: string, action?: ToastAction, duration?: number) => string;
    success: (
      title: string,
      description?: string,
      action?: ToastAction,
      duration?: number
    ) => string;
    warning: (
      title: string,
      description?: string,
      action?: ToastAction,
      duration?: number
    ) => string;
    error: (title: string, description?: string, action?: ToastAction, duration?: number) => string;
    contract: (
      title: string,
      description?: string,
      action?: ToastAction,
      duration?: number
    ) => string;
  };
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toastInput: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const duration = toastInput.duration ?? 5000;

      const newToast: Toast = {
        ...toastInput,
        id,
        duration,
      };

      setToasts((current) => [...current, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }

      return id;
    },
    [dismissToast]
  );

  const toastHelpers = {
    info: useCallback(
      (title: string, description?: string, action?: ToastAction, duration?: number) =>
        addToast({ title, description, type: 'info', action, duration }),
      [addToast]
    ),
    success: useCallback(
      (title: string, description?: string, action?: ToastAction, duration?: number) =>
        addToast({ title, description, type: 'success', action, duration }),
      [addToast]
    ),
    warning: useCallback(
      (title: string, description?: string, action?: ToastAction, duration?: number) =>
        addToast({ title, description, type: 'warning', action, duration }),
      [addToast]
    ),
    error: useCallback(
      (title: string, description?: string, action?: ToastAction, duration?: number) =>
        addToast({ title, description, type: 'error', action, duration }),
      [addToast]
    ),
    contract: useCallback(
      (title: string, description?: string, action?: ToastAction, duration?: number) =>
        addToast({ title, description, type: 'contract', action, duration }),
      [addToast]
    ),
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, dismissToast, toast: toastHelpers }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
