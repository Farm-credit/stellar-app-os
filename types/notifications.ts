export type NotificationType =
  'account_alert' | 'payout' | 'verification' | 'info' | 'warning' | 'error' | 'success';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface NotificationAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export interface Notification {
  id: string;
  title: string;
  description?: string;
  type: NotificationType;
  priority: NotificationPriority;
  timestamp: Date | string;
  read: boolean;
  archived: boolean;
  action?: NotificationAction;
  metadata?: Record<string, unknown>;
}

export interface ToastNotification {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'contract';
  duration?: number;
  action?: NotificationAction;
}

export interface NotificationState {
  notifications: Notification[];
  toasts: ToastNotification[];
  unreadCount: number;
  isDrawerOpen: boolean;
}

export interface NotificationActions {
  addNotification: (
    notification: Omit<Notification, 'id' | 'timestamp' | 'read' | 'archived'>
  ) => string;
  addToast: (toast: Omit<ToastNotification, 'id'>) => string;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  archiveNotification: (id: string) => void;
  removeNotification: (id: string) => void;
  dismissToast: (id: string) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  clearAll: () => void;
  clearRead: () => void;
}

export type NotificationContextValue = NotificationState & NotificationActions;
