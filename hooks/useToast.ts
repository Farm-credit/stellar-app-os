'use client';

import { useNotification } from '@/contexts/NotificationContext';

export function useToast() {
  const notificationContext = useNotification();
  const { toast, toasts, dismissToast } = notificationContext;

  const addToast = (
    message: string,
    type: 'success' | 'error' | 'info' = 'info',
    duration?: number
  ) => {
    if (type === 'success') {
      toast.success(message, undefined, undefined, duration);
    } else if (type === 'error') {
      toast.error(message, undefined, undefined, duration);
    } else {
      toast.info(message, undefined, undefined, duration);
    }
  };

  return { toasts, addToast, removeToast: dismissToast, toast };
}
