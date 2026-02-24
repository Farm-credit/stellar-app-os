'use client';

import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { subscribeToToasts, type ToastType } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToToasts((toast) => {
      setToasts((prev) => [...prev, toast]);
    });

    return unsubscribe;
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-stellar-green flex-shrink-0" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />;
      case 'info':
        return <Info className="h-5 w-5 text-stellar-blue flex-shrink-0" />;
      default:
        return <Info className="h-5 w-5 text-stellar-blue flex-shrink-0" />;
    }
  };

  const getBackgroundClass = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'bg-stellar-green/10 border-stellar-green/30';
      case 'error':
        return 'bg-destructive/10 border-destructive/30';
      case 'info':
        return 'bg-stellar-blue/10 border-stellar-blue/30';
      default:
        return 'bg-muted/50 border-border';
    }
  };

  return (
    <div
      className="fixed bottom-0 right-0 z-50 flex flex-col gap-2 p-4 pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-right-4 fade-in-0 duration-200',
            getBackgroundClass(toast.type)
          )}
          role="alert"
        >
          {getIcon(toast.type)}
          <p className="text-sm font-medium text-foreground flex-1">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
