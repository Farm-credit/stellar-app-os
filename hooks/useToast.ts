'use client';

import { useToast as useToastContext } from '@/contexts/ToastContext';

export function useToast() {
  const { addToast: newAddToast, toasts, dismissToast } = useToastContext();

  const addToast = (
    message: string,
    type: 'success' | 'error' | 'info' = 'info',
    duration?: number
  ) => {
    newAddToast({ title: message, type, duration });
  };

  return { toasts, addToast, removeToast: dismissToast };
}
