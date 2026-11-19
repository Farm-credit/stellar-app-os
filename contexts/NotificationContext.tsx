'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
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

const NEWSLETTER_OPT_IN_STORAGE_KEY = 'sponsor.newsletterOptIn';

const DIGEST_PREFERENCES_STORAGE_KEY = 'sponsor.digestPreferences';

const DIGEST_SEND_HOUR = 9;

export interface DigestPreferences {
  enabled: boolean;
  timezone: string;
}

export interface ExpertChatMessage {
  id: string;
  conversationId: string;
  sender: 'farmer' | 'expert';
  senderName: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export interface ExpertChatConversation {
  id: string;
  expertName: string;
  topic: string;
  messages: ExpertChatMessage[];
  unreadCount: number;
}

export interface ExpertChatReplyEvent {
  conversationId: string;
  expertName: string;
  topic?: string;
  body: string;
  timestamp?: string;
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function readStoredNewsletterOptIn(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  try {
    const stored = window.localStorage.getItem(NEWSLETTER_OPT_IN_STORAGE_KEY);
    if (stored === null) {
      return true;
    }
    return stored === 'true';
  } catch {
    return true;
  }
}

/**
 * Payload describing a published monthly forest health newsletter.
 * Used to surface the newsletter as an in-app notification.
 */
export interface NewsletterPublishedEvent {
  newsletterId: string;
  title?: string;
  summary?: string;
  issueMonth?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

function buildNewsletterNotification(
  event: NewsletterPublishedEvent
): Omit<Notification, 'id' | 'timestamp' | 'read' | 'archived'> {
  const title = event.title ?? 'Monthly Forest Health Newsletter';
  const description =
    event.summary ??
    'Your monthly forest health newsletter is ready with platform news, featured stories, species spotlights, and conservation tips.';

  return {
    title,
    description,
    type: 'newsletter',
    priority: 'low',
    action: {
      label: 'Read Newsletter',
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.open(`/newsletter/${event.newsletterId}`, '_blank');
        }
      },
      variant: 'secondary',
    },
    metadata: {
      ...(event.metadata ?? {}),
      newsletterId: event.newsletterId,
      ...(event.issueMonth ? { issueMonth: event.issueMonth } : {}),
    },
  };
}

function persistNewsletterOptIn(value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(NEWSLETTER_OPT_IN_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage failures (e.g. private mode or quota exceeded).
  }
}

function readStoredDigestPreferences(): DigestPreferences {
  const fallback: DigestPreferences = { enabled: true, timezone: detectTimezone() };
  if (typeof window === 'undefined') {
    return fallback;
  }
  try {
    const stored = window.localStorage.getItem(DIGEST_PREFERENCES_STORAGE_KEY);
    if (!stored) {
      return fallback;
    }
    const parsed = JSON.parse(stored) as Partial<DigestPreferences>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : fallback.enabled,
      timezone:
        typeof parsed.timezone === 'string' && parsed.timezone.length > 0
          ? parsed.timezone
          : fallback.timezone,
    };
  } catch {
    return fallback;
  }
}

function persistDigestPreferences(prefs: DigestPreferences): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(DIGEST_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage failures (e.g. private mode or quota exceeded).
  }
}

/**
 * Compute the next 9 AM (in the given timezone) after `from`.
 * Falls back to a UTC-based calculation if the timezone is invalid.
 */
export function computeNextDigestSendTime(
  timezone: string,
  from: Date = new Date()
): Date {
  const safeTimezone = timezone || 'UTC';

  const zonedParts = (date: Date): { year: number; month: number; day: number; hour: number } => {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: safeTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
      return {
        year: Number(get('year')),
        month: Number(get('month')),
        day: Number(get('day')),
        hour: Number(get('hour')) % 24,
      };
    } catch {
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
      };
    }
  };

  const parts = zonedParts(from);
  const todayAtNine = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, DIGEST_SEND_HOUR, 0, 0, 0)
  );

  // Offset between the timezone's wall clock and UTC at `from`.
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, 0, 0, 0);
  const offsetMs = wallClockAsUtc - Math.floor(from.getTime() / 60000) * 60000;

  let candidate = new Date(todayAtNine.getTime() - offsetMs);
  if (candidate.getTime() <= from.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return candidate;
}

export function normalizeToastDuration(duration?: number): number {
  if (duration === undefined || Number.isNaN(duration)) {
    return DEFAULT_TOAST_DURATION;
  }

  if (duration <= 0) {
    return 0;
  }

  return Math.min(Math.max(duration, MIN_TOAST_DURATION), MAX_TOAST_DURATION);
}

/**
 * Tree lifecycle events surfaced via the push/SSE channel.
 * These map to in-app notifications with the corresponding NotificationType.
 */
export type TreeLifecycleEventKind =
  | 'tree_planted'
  | 'survival_1_year'
  | 'milestone_5_year'
  | 'sponsor_achievement';

export interface TreeLifecycleNotificationEvent {
  kind: TreeLifecycleEventKind;
  treeId?: string;
  treeName?: string;
  projectId?: string;
  projectName?: string;
  achievementId?: string;
  achievementName?: string;
  achievementDescription?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Listener invoked whenever a tree lifecycle event is received and converted
 * into an in-app notification. Receives the event and the created notification id.
 */
export type TreeLifecycleEventListener = (
  event: TreeLifecycleNotificationEvent,
  notificationId: string
) => void;

interface TreeEventMapping {
  type: Notification['type'];
  priority: Notification['priority'];
  title: string;
  description: string;
  actionLabel?: string;
  actionPath?: string;
}

function buildTreeEventMapping(event: TreeLifecycleNotificationEvent): TreeEventMapping {
  const treeLabel = event.treeName ?? event.treeId ?? 'Your tree';
  const projectLabel = event.projectName ?? event.projectId ?? 'your project';

  switch (event.kind) {
    case 'tree_planted':
      return {
        type: 'tree_planted',
        priority: 'medium',
        title: 'Tree Planted',
        description: `${treeLabel} has been planted in ${projectLabel}.`,
        actionLabel: 'View Tree',
        actionPath: event.treeId ? `/trees/${event.treeId}` : '/trees',
      };
    case 'survival_1_year':
      return {
        type: 'tree_survival_1_year',
        priority: 'medium',
        title: '1-Year Survival Milestone',
        description: `${treeLabel} has survived its first year in ${projectLabel}.`,
        actionLabel: 'View Tree',
        actionPath: event.treeId ? `/trees/${event.treeId}` : '/trees',
      };
    case 'milestone_5_year':
      return {
        type: 'tree_milestone_5_year',
        priority: 'high',
        title: '5-Year Milestone Reached',
        description: `${treeLabel} has reached its 5-year milestone in ${projectLabel}.`,
        actionLabel: 'View Tree',
        actionPath: event.treeId ? `/trees/${event.treeId}` : '/trees',
      };
    case 'sponsor_achievement':
      return {
        type: 'sponsor_achievement',
        priority: 'high',
        title: event.achievementName ? `Achievement Unlocked: ${event.achievementName}` : 'Achievement Unlocked',
        description:
          event.achievementDescription ??
          `You unlocked a new sponsor achievement${event.achievementName ? `: ${event.achievementName}` : ''}.`,
        actionLabel: 'View Achievements',
        actionPath: event.achievementId
          ? `/achievements/${event.achievementId}`
          : '/achievements',
      };
    default:
      return {
        type: 'account_alert',
        priority: 'low',
        title: 'Tree Update',
        description: 'There is a new update on your tree.',
      };
  }
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }): ReactElement {
  const [notifications, setNotifications] = useState<Notification[]>(defaultNotifications);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [newsletterOptIn, setNewsletterOptInState] = useState<boolean>(readStoredNewsletterOptIn);
  const [digestPreferences, setDigestPreferencesState] =
    useState<DigestPreferences>(readStoredDigestPreferences);
  const [expertChatConversations, setExpertChatConversations] = useState<
    ExpertChatConversation[]
  >([]);

  const treeEventListenersRef = useRef<Set<TreeLifecycleEventListener>>(new Set());
  const expertChatListenersRef = useRef<Set<(message: ExpertChatMessage) => void>>(new Set());

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
    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const notifyTreeEvent = useCallback(
    (event: TreeLifecycleNotificationEvent): string => {
      const mapping = buildTreeEventMapping(event);
      const id = generateId();

      const action: NotificationAction | undefined =
        mapping.actionLabel && mapping.actionPath
          ? {
              label: mapping.actionLabel,
              onClick: () => {
                if (typeof window !== 'undefined') {
                  window.open(mapping.actionPath as string, '_blank');
                }
              },
              variant: 'primary',
            }
          : undefined;

      const newNotification: Notification = {
        id,
        title: mapping.title,
        description: mapping.description,
        type: mapping.type,
        priority: mapping.priority,
        timestamp: event.timestamp ?? new Date().toISOString(),
        read: false,
        archived: false,
        action,
        metadata: {
          ...(event.metadata ?? {}),
          eventKind: event.kind,
          ...(event.treeId ? { treeId: event.treeId } : {}),
          ...(event.treeName ? { treeName: event.treeName } : {}),
          ...(event.projectId ? { projectId: event.projectId } : {}),
          ...(event.projectName ? { projectName: event.projectName } : {}),
          ...(event.achievementId ? { achievementId: event.achievementId } : {}),
          ...(event.achievementName ? { achievementName: event.achievementName } : {}),
        },
      };

      setNotifications((prev) => [newNotification, ...prev]);

      treeEventListenersRef.current.forEach((listener) => {
        try {
          listener(event, id);
        } catch {
          // Ignore listener failures so one bad subscriber cannot break others.
        }
      });

      return id;
    },
    []
  );

  const subscribeToTreeEvents = useCallback(
    (listener: TreeLifecycleEventListener): (() => void) => {
      treeEventListenersRef.current.add(listener);
      return () => {
        treeEventListenersRef.current.delete(listener);
      };
    },
    []
  );

  useEffect(() => {
    return () => {
      treeEventListenersRef.current.clear();
      expertChatListenersRef.current.clear();
    };
  }, []);

  const setDigestPreferences = useCallback((prefs: Partial<DigestPreferences>) => {
    setDigestPreferencesState((prev) => {
      const next: DigestPreferences = {
        enabled: typeof prefs.enabled === 'boolean' ? prefs.enabled : prev.enabled,
        timezone:
          typeof prefs.timezone === 'string' && prefs.timezone.length > 0
            ? prefs.timezone
            : prev.timezone,
      };
      persistDigestPreferences(next);
      return next;
    });
  }, []);

  const nextDigestSendTime = useMemo(
    () => computeNextDigestSendTime(digestPreferences.timezone),
    [digestPreferences.timezone]
  );

  const expertChatUnreadCount = useMemo(
    () => expertChatConversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [expertChatConversations]
  );

  const addExpertChatMessage = useCallback(
    (conversationId: string, message: Omit<ExpertChatMessage, 'id' | 'conversationId' | 'timestamp' | 'read'> & { timestamp?: string; read?: boolean }) => {
      const id = generateId();
      const newMessage: ExpertChatMessage = {
        ...message,
        id,
        conversationId,
        timestamp: message.timestamp ?? new Date().toISOString(),
        read: message.read ?? message.sender === 'farmer',
      };

      setExpertChatConversations((prev) => {
        const existing = prev.find((c) => c.id === conversationId);
        if (!existing) {
          return [
            ...prev,
            {
              id: conversationId,
              expertName: newMessage.sender === 'expert' ? newMessage.senderName : 'Support',
              topic: 'Agricultural assistance',
              messages: [newMessage],
              unreadCount: newMessage.read ? 0 : 1,
            },
          ];
        }
        return prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: [...c.messages, newMessage],
                unreadCount: newMessage.read ? c.unreadCount : c.unreadCount + 1,
              }
            : c
        );
      });

      expertChatListenersRef.current.forEach((listener) => {
        try {
          listener(newMessage);
        } catch {
          // Ignore listener failures so one bad subscriber cannot break others.
        }
      });

      return id;
    },
    []
  );

  const markConversationRead = useCallback((conversationId: string) => {
    setExpertChatConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              unreadCount: 0,
              messages: c.messages.map((m) => (m.read ? m : { ...m, read: true })),
            }
          : c
      )
    );
  }, []);

  const subscribeToExpertChat = useCallback(
    (listener: (message: ExpertChatMessage) => void): (() => void) => {
      expertChatListenersRef.current.add(listener);
      return () => {
        expertChatListenersRef.current.delete(listener);
      };
    },
    []
  );

  const notifyExpertChatReply = useCallback(
    (event: ExpertChatReplyEvent): string => {
      const timestamp = event.timestamp ?? new Date().toISOString();
      const messageId = addExpertChatMessage(event.conversationId, {
        sender: 'expert',
        senderName: event.expertName,
        body: event.body,
        timestamp,
        read: false,
      });

      const notificationId = addNotification({
        title: `New message from ${event.expertName}`,
        description: event.body,
        type: 'account_alert',
        priority: 'medium',
        action: {
          label: 'Open Chat',
          onClick: () => {
            if (typeof window !== 'undefined') {
              window.open(`/support/chat/${event.conversationId}`, '_blank');
            }
          },
          variant: 'primary',
        },
        metadata: {
          conversationId: event.conversationId,
          expertName: event.expertName,
          ...(event.topic ? { topic: event.topic } : {}),
          chatMessageId: messageId,
        },
      });

      addToast({
        title: `New message from ${event.expertName}`,
        description: event.body,
        type: 'info',
        action: {
          label: 'Open Chat',
          onClick: () => {
            if (typeof window !== 'undefined') {
              window.open(`/support/chat/${event.conversationId}`, '_blank');
            }
          },
          variant: 'primary',
        },
      });

      return notificationId;
    },
    [addExpertChatMessage, addNotification, addToast]
  );

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

  const setNewsletterOptIn = useCallback((value: boolean) => {
    setNewsletterOptInState(value);
    persistNewsletterOptIn(value);
  }, []);

  const toggleNewsletterOptIn = useCallback(() => {
    setNewsletterOptInState((prev) => {
      const next = !prev;
      persistNewsletterOptIn(next);
      return next;
    });
  }, []);

  const notifyNewsletterPublished = useCallback(
    (event: NewsletterPublishedEvent): string | undefined => {
      if (!newsletterOptIn) {
        return undefined;
      }
      const id = generateId();
      const newNotification: Notification = {
        ...buildNewsletterNotification(event),
        id,
        timestamp: event.timestamp ?? new Date().toISOString(),
        read: false,
        archived: false,
      };
      setNotifications((prev) => [newNotification, ...prev]);
      return id;
    },
    [newsletterOptIn]
  );

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
      notifyTreeEvent,
      subscribeToTreeEvents,
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
      newsletterOptIn,
      setNewsletterOptIn,
      toggleNewsletterOptIn,
      notifyNewsletterPublished,
      digestPreferences,
      setDigestPreferences,
      nextDigestSendTime,
      expertChatConversations,
      expertChatUnreadCount,
      addExpertChatMessage,
      markConversationRead,
      subscribeToExpertChat,
      notifyExpertChatReply,
    }),
    [
      notifications,
      toasts,
      unreadCount,
      isDrawerOpen,
      addNotification,
      addToast,
      notifyTreeEvent,
      subscribeToTreeEvents,
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
      newsletterOptIn,
      setNewsletterOptIn,
      toggleNewsletterOptIn,
      notifyNewsletterPublished,
      digestPreferences,
      setDigestPreferences,
      nextDigestSendTime,
      expertChatConversations,
      expertChatUnreadCount,
      addExpertChatMessage,
      markConversationRead,
      subscribeToExpertChat,
      notifyExpertChatReply,
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
</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>