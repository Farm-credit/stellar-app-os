export type Theme = "light" | "dark" | "system";

export type Language = "en" | "fr" | "es" | "pt" | "de";

export type Currency = "USD" | "EUR" | "GBP" | "NGN" | "GHS";

export type NotificationPreferences = {
  emailBookings: boolean;
  emailMarketing: boolean;
  pushPayments: boolean;
  pushUpdates: boolean;
  smsAlerts: boolean;
};

export type UserSettings = {
  name: string;
  email: string;
  notifications: NotificationPreferences;
  language: Language;
  currency: Currency;
  theme: Theme;
};

export type SettingsFormData = UserSettings & {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};