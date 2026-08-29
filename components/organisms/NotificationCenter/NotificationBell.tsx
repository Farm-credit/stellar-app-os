'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotification } from '@/contexts/NotificationContext';

export function NotificationBell(): React.ReactElement {
  const { unreadCount, closeDrawer, toggleDrawer, isDrawerOpen } = useNotification();
  const bellRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isDrawerOpen && bellRef.current) {
      bellRef.current.focus();
    }
  }, [isDrawerOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDrawer();
      }
      if (e.key === 'Escape') {
        closeDrawer();
      }
    },
    [closeDrawer, toggleDrawer]
  );

  return (
    <div className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={toggleDrawer}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800',
          'transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue',
          'flex items-center justify-center'
        )}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Open notifications'}
        aria-expanded={isDrawerOpen}
        aria-haspopup="dialog"
        aria-controls="notification-center-drawer"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center',
              'rounded-full bg-red-500 text-white text-xs font-medium',
              'animate-pulse'
            )}
            aria-label={`${unreadCount} unread notifications`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}

export function ToastContainer(): React.ReactElement {
  const { toasts, dismissToast } = useNotification();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

interface ToastProps {
  toast: {
    id: string;
    title: string;
    description?: string;
    type: 'success' | 'error' | 'warning' | 'info' | 'contract';
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
      variant?: 'primary' | 'secondary';
    };
  };
  onDismiss: (id: string) => void;
}

function Toast({ toast, onDismiss }: ToastProps): React.ReactElement {
  const typeStyles = {
    success: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
    error: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
    warning: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
    info: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
    contract: 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800',
  };

  const typeIcons = {
    success: (
      <svg
        className="h-5 w-5 text-green-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg
        className="h-5 w-5 text-red-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
    warning: (
      <svg
        className="h-5 w-5 text-yellow-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
    info: (
      <svg
        className="h-5 w-5 text-blue-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    contract: (
      <svg
        className="h-5 w-5 text-purple-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
  };

  const role = toast.type === 'error' ? 'alert' : 'status';
  const ariaLive = toast.type === 'error' ? 'assertive' : 'polite';

  return (
    <div
      role={role}
      aria-live={ariaLive}
      className={cn(
        'rounded-lg border p-4 flex items-start gap-3 shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300',
        typeStyles[toast.type]
      )}
    >
      <div className="shrink-0 mt-0.5" aria-hidden="true">
        {typeIcons[toast.type]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{toast.description}</p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action.onClick();
              onDismiss(toast.id);
            }}
            className={cn(
              'mt-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
              toast.action.variant === 'primary'
                ? 'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 focus:ring-blue-500'
                : 'text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 focus:ring-gray-500'
            )}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-current"
        aria-label="Dismiss notification"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
