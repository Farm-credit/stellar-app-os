'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Bell, Check, Archive, Filter, X as XIcon, Loader2, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNotification } from '@/contexts/NotificationContext';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { ScrollArea } from '@/components/ui/scroll-area';

type NotificationType = 'payout' | 'account_alert' | 'verification';
type NotificationPriority = 'high' | 'medium' | 'low';

interface NotificationAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

interface Notification {
  id: string;
  title: string;
  description?: string;
  type: NotificationType;
  priority: NotificationPriority;
  timestamp: string;
  read: boolean;
  archived: boolean;
  action?: NotificationAction;
  metadata?: Record<string, string | number | boolean>;
}

type FilterType = 'all' | 'unread' | 'archived' | 'payout' | 'account_alert' | 'verification';

const typeIcons: Record<NotificationType, React.ReactNode> = {
  payout: (
    <div className="w-5 h-5 text-green-500" aria-hidden="true">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
  ),
  account_alert: (
    <div className="w-5 h-5 text-yellow-500" aria-hidden="true">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    </div>
  ),
  verification: (
    <div className="w-5 h-5 text-blue-500" aria-hidden="true">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
  ),
};

const typeLabels: Record<NotificationType, string> = {
  payout: 'Payout',
  account_alert: 'Account Alert',
  verification: 'Verification',
};

const priorityColors: Record<NotificationPriority, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

const priorityLabels: Record<NotificationPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const filterOptions: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'archived', label: 'Archived' },
  { value: 'payout', label: 'Payouts' },
  { value: 'account_alert', label: 'Alerts' },
  { value: 'verification', label: 'Verification' },
];

export function NotificationCenterDrawer(): React.ReactElement {
  const {
    notifications,
    unreadCount,
    isDrawerOpen,
    closeDrawer,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    removeNotification,
    clearAll,
    clearRead,
  } = useNotification();

  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isDrawerOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      drawerRef.current?.focus();
    } else {
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDrawerOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDrawer();
      }
      if (e.key === 'Tab') {
        const focusableElements = drawerRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements?.length) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, closeDrawer]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (filter === 'unread') return !notification.read && !notification.archived;
      if (filter === 'archived') return notification.archived;
      if (filter === 'payout') return notification.type === 'payout';
      if (filter === 'account_alert') return notification.type === 'account_alert';
      if (filter === 'verification') return notification.type === 'verification';
      return true;
    });
  }, [notifications, filter]);

  const handleMarkAsRead = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      markAsRead(id);
    },
    [markAsRead]
  );

  const handleArchive = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      archiveNotification(id);
    },
    [archiveNotification]
  );

  const handleRemove = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      removeNotification(id);
    },
    [removeNotification]
  );

  const handleActionClick = useCallback(
    (action: NotificationAction | undefined, e: React.MouseEvent) => {
      if (action) {
        e.stopPropagation();
        action.onClick();
      }
    },
    []
  );

  const handleClearAll = useCallback(async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    clearAll();
    setIsLoading(false);
  }, [clearAll]);

  const handleClearRead = useCallback(async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    clearRead();
    setIsLoading(false);
  }, [clearRead]);

  const formatTime = useCallback((timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'Just now';
    }
  }, []);

  if (!isDrawerOpen) return null;

  return (
    <>
      <div
        data-testid="notification-overlay"
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 animate-in fade-in"
        onClick={closeDrawer}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-xl flex flex-col animate-in slide-in-from-right-full duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="Notification Center"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close notification center"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-wrap">
          <div className="flex items-center gap-1.5 h-8 px-3 text-sm">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
              className="bg-transparent border-none text-sm font-medium text-gray-700 dark:text-gray-300 focus:outline-none cursor-pointer appearance-none"
              aria-label="Filter notifications"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
              <Bell
                className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4"
                aria-hidden="true"
              />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                {filter === 'archived' ? 'No archived notifications' : 'No notifications'}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {filter === 'archived'
                  ? 'Archived notifications will appear here'
                  : filter === 'unread'
                    ? "You're all caught up!"
                    : 'Notifications will appear here when you receive them'}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                {filteredNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    onArchive={handleArchive}
                    onRemove={handleRemove}
                    onActionClick={handleActionClick}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {(filteredNotifications.length > 0 || notifications.length > 0) && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {unreadCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllAsRead}
                  disabled={isLoading}
                  className="min-w-0"
                >
                  <Check className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Mark all as read
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearRead}
                disabled={
                  isLoading || notifications.filter((n) => n.read && !n.archived).length === 0
                }
                className="min-w-0"
              >
                Clear read
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={isLoading || notifications.length === 0}
              className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 min-w-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" aria-hidden="true" />
                  Clearing...
                </>
              ) : (
                'Clear all'
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function NotificationItem({
  notification,
  onMarkAsRead,
  onArchive,
  onRemove,
  onActionClick,
  formatTime,
}: {
  notification: Notification;
  onMarkAsRead: (id: string, e: React.MouseEvent) => void;
  onArchive: (id: string, e: React.MouseEvent) => void;
  onRemove: (id: string, e: React.MouseEvent) => void;
  onActionClick: (action: NotificationAction | undefined, e: React.MouseEvent) => void;
  formatTime: (timestamp: string) => string;
}): React.ReactElement {
  const Icon = typeIcons[notification.type];
  const isUnread = !notification.read && !notification.archived;
  const isArchived = notification.archived;

  return (
    <article
      className={cn(
        'relative group p-4 rounded-xl border transition-all duration-200',
        'bg-white dark:bg-gray-800',
        isUnread && 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10',
        isArchived && 'border-gray-200 dark:border-gray-700 opacity-70',
        !isUnread &&
          !isArchived &&
          'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      )}
      aria-labelledby={`notification-${notification.id}-title`}
    >
      <div className="flex gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0',
            notification.type === 'payout' && 'bg-green-100 dark:bg-green-900/30',
            notification.type === 'account_alert' && 'bg-yellow-100 dark:bg-yellow-900/30',
            notification.type === 'verification' && 'bg-blue-100 dark:bg-blue-900/30'
          )}
          aria-hidden="true"
        >
          {Icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3
                id={`notification-${notification.id}-title`}
                className={cn(
                  'font-medium text-gray-900 dark:text-white truncate',
                  isUnread && 'font-semibold'
                )}
              >
                {notification.title}
              </h3>
              {notification.description && (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {notification.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Badge
                variant={isUnread ? 'default' : 'outline'}
                className={cn(
                  'text-xs',
                  isUnread && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                )}
              >
                {typeLabels[notification.type]}
              </Badge>
              <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full mr-1',
                    priorityColors[notification.priority]
                  )}
                  aria-hidden="true"
                />
                {priorityLabels[notification.priority]}
              </Badge>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <time
              dateTime={notification.timestamp}
              className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"
            >
              {formatTime(notification.timestamp)}
            </time>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {notification.action && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => onActionClick(notification.action, e)}
                  className="h-8 px-3 text-xs"
                >
                  {notification.action.label}
                </Button>
              )}
              {!notification.read && !notification.archived && (
                <button
                  type="button"
                  onClick={(e) => onMarkAsRead(notification.id, e)}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Mark as read"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              {!notification.archived && (
                <button
                  type="button"
                  onClick={(e) => onArchive(notification.id, e)}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Archive notification"
                >
                  <Archive className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => onRemove(notification.id, e)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-label={notification.archived ? 'Delete notification' : 'Remove notification'}
              >
                <XIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {notification.metadata && Object.keys(notification.metadata).length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <dl className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(notification.metadata).map(([key, value]) => (
                  <React.Fragment key={key}>
                    <dt className="text-gray-500 dark:text-gray-400 capitalize">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </dt>
                    <dd className="text-gray-900 dark:text-white font-medium text-right">
                      {String(value)}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {isUnread && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 rounded-r-full"
          aria-hidden="true"
        />
      )}
    </article>
  );
}
