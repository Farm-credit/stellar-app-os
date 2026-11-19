export type NotificationType =
  | 'account_alert'
  | 'payout'
  | 'verification'
  | 'info'
  | 'warning'
  | 'error'
  | 'success'
  | 'newsletter'
  | 'tree_planted'
  | 'tree_survival_1y'
  | 'tree_milestone_5y'
  | 'achievement_unlocked';

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
  /** Whether the sponsor has opted in to the monthly forest health newsletter. */
  newsletterOptIn: boolean;
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
  /** Update and persist the sponsor's newsletter subscription preference. */
  setNewsletterOptIn: (optIn: boolean) => void;
  /** Toggle the sponsor's newsletter subscription preference. */
  toggleNewsletterOptIn: () => void;
}

export type NotificationContextValue = NotificationState & NotificationActions;

/**
 * Push-notification event types for real-time tree milestones and sponsor
 * achievements. These mirror the milestone definitions in
 * `lib/trees/milestones.ts`, which act as the event source.
 */
export type PushNotificationEventType =
  | 'tree_planted'
  | 'tree_survival_1y'
  | 'tree_milestone_5y'
  | 'achievement_unlocked';

export interface TreeMilestonePushPayload {
  type: 'tree_planted' | 'tree_survival_1y' | 'tree_milestone_5y';
  treeId: string;
  sponsorId: string;
  species?: string;
  location?: string;
  /** ISO timestamp of when the milestone occurred. */
  occurredAt: string;
}

export interface AchievementPushPayload {
  type: 'achievement_unlocked';
  sponsorId: string;
  achievementId: string;
  achievementTitle: string;
  treeId?: string;
  species?: string;
  location?: string;
  /** ISO timestamp of when the achievement was unlocked. */
  occurredAt: string;
}

export type PushNotificationPayload =
  | TreeMilestonePushPayload
  | AchievementPushPayload;

export interface PushNotificationMessage {
  id: string;
  payload: PushNotificationPayload;
  title: string;
  body: string;
  /** Device tokens the message was dispatched to. */
  tokens: string[];
  createdAt: string;
}

export interface PushNotificationDispatcher {
  /** Register a device token to receive push notifications. */
  registerDeviceToken: (token: string) => void;
  /** Unregister a previously registered device token. */
  unregisterDeviceToken: (token: string) => void;
  /** Currently registered device tokens. */
  getDeviceTokens: () => string[];
  /**
   * Dispatch a push payload to all registered device tokens via the existing
   * notifications layer. Returns the dispatched message, or null when there
   * are no registered tokens.
   */
  dispatch: (payload: PushNotificationPayload) => PushNotificationMessage | null;
}
