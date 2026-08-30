'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  type ReactElement,
} from 'react';
import {
  type Notification,
  type ToastNotification,
  type NotificationAction,
  type NotificationContextValue,
} from '@/types/notifications';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const defaultNotifications: Notification[] = [
  {
    id: 'notif-1',
    title: 'Payout Received',
    description: 'You received 1,250 USDC from carbon credit sale',
    type: 'payout',
    priority: 'high',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: false,
    archived: false,
    action: {
      label: 'View Details',
      onClick: () => window.open('/dashboard/payouts', '_blank'),
      variant: 'primary',
    },
    metadata: { amount: '1250', currency: 'USDC', transactionId: 'tx_12345' },
  },
  {
    id: 'notif-2',
    title: 'Account Verification Required',
    description: 'Additional documentation needed for KYC verification',
    type: 'verification',
    priority: 'high',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    read: false,
    archived: false,
    action: {
      label: 'Upload Documents',
      onClick: () => window.open('/verify', '_blank'),
      variant: 'primary',
    },
    metadata: { requiredDocs: ['ID', 'Proof of Address'] },
  },
  {
    id: 'notif-3',
    title: 'New Carbon Credit Listing',
    description: 'Your project "Amazon Reforestation" has been listed on the marketplace',
    type: 'account_alert',
    priority: 'medium',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    read: true,
    archived: false,
    action: {
      label: 'View Listing',
      onClick: () => window.open('/marketplace/project/123', '_blank'),
      variant: 'secondary',
    },
    metadata: { projectId: '123', creditsAvailable: 5000 },
  },
  {
    id: 'notif-4',
    title: 'Payout Scheduled',
    description: 'Next payout of 2,500 USDC scheduled for tomorrow',
    type: 'payout',
    priority: 'medium',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    read: true,
    archived: true,
    metadata: {
      amount: '2500',
      currency: 'USDC',
      scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  },
  {
    id: 'notif-5',
    title: 'Verification Approved',
    description: 'Your KYC verification has been approved',
    type: 'verification',
    priority: 'low',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    read: true,
    archived: true,
    metadata: { verificationLevel: 'Tier 2' },
  },
];

const DEFAULT_TOAST_DURATION = 5000;
const MIN_TOAST_DURATION = 2000;
const MAX_TOAST_DURATION = 10000;

export function normalizeToastDuration(duration?: number): number {
  if (duration === undefined || Number.isNaN(duration)) {
    return DEFAULT_TOAST_DURATION;
  }

  if (duration <= 0) {
    return 0;
  }

  return Math.min(Math.max(duration, MIN_TOAST_DURATION), MAX_TOAST_DURATION);
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }): ReactElement {
  const [notifications, setNotifications] = useState<Notification[]>(defaultNotifications);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read && !n.archived).length,
    [notifications]
  );

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'timestamp' | 'read' | 'archived'>) => {
      const id = generateId();
      const newNotification: Notification = {
        ...notification,
        id,
        timestamp: new Date().toISOString(),
        read: false,
        archived: false,
      };
      setNotifications((prev) => [newNotification, ...prev]);
      return id;
    },
    []
  );

  const addToast = useCallback((toast: Omit<ToastNotification, 'id'>) => {
    const id = generateId();
    const duration = normalizeToastDuration(toast.duration);
    const newToast: ToastNotification = { ...toast, id, duration };
    setToasts((prev) => [newToast, ...prev]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => (n.archived ? n : { ...n, read: true })));
  }, []);

  const archiveNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, archived: true } : n)));
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((prev) => !prev), []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const clearRead = useCallback(() => {
    setNotifications((prev) => prev.filter((n) => !n.read || n.archived));
  }, []);

  const toastHelpers = useMemo(
    () => ({
      success: (
        title: string,
        description?: string,
        action?: NotificationAction,
        duration?: number
      ) => addToast({ title, description, type: 'success', action, duration }),
      error: (
        title: string,
        description?: string,
        action?: NotificationAction,
        duration?: number
      ) => addToast({ title, description, type: 'error', action, duration }),
      warning: (
        title: string,
        description?: string,
        action?: NotificationAction,
        duration?: number
      ) => addToast({ title, description, type: 'warning', action, duration }),
      info: (title: string, description?: string, action?: NotificationAction, duration?: number) =>
        addToast({ title, description, type: 'info', action, duration }),
      contract: (
        title: string,
        description?: string,
        action?: NotificationAction,
        duration?: number
      ) => addToast({ title, description, type: 'contract', action, duration }),
    }),
    [addToast]
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      toasts,
      unreadCount,
      isDrawerOpen,
      addNotification,
      addToast,
      markAsRead,
      markAllAsRead,
      archiveNotification,
      removeNotification,
      dismissToast,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      clearAll,
      clearRead,
      toast: toastHelpers,
    }),
    [
      notifications,
      toasts,
      unreadCount,
      isDrawerOpen,
      addNotification,
      addToast,
      markAsRead,
      markAllAsRead,
      archiveNotification,
      removeNotification,
      dismissToast,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      clearAll,
      clearRead,
      toastHelpers,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
