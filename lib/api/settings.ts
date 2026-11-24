interface NotificationPreferences {
  digestEnabled: boolean;
  timeZone: string;
}

const STORAGE_KEY = 'notification-preferences';

const defaults: NotificationPreferences = {
  digestEnabled: false,
  timeZone: 'UTC',
};

export const settingsApi = {
  getNotificationPreferences(): Promise<NotificationPreferences> {
    if (typeof window === 'undefined') return Promise.resolve(defaults);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return Promise.resolve(defaults);
    try {
      return Promise.resolve({
        ...defaults,
        ...(JSON.parse(raw) as Partial<NotificationPreferences>),
      });
    } catch {
      return Promise.resolve(defaults);
    }
  },

  updateNotificationPreferences(
    preferences: NotificationPreferences
  ): Promise<NotificationPreferences> {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }
    return Promise.resolve(preferences);
  },
};
