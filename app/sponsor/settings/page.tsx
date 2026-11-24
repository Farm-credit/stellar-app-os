"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  Globe,
  Mail,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import {
  createSampleMilestoneAlert,
  DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
  MILESTONE_EVENT_META,
  NOTIFICATION_STORAGE_KEY,
  validateNotificationSettings,
  type DigestFrequency,
  type MilestoneAlertItem,
  type MilestoneEventType,
  type NotificationChannel,
  type SponsorNotificationSettings,
  type ValidationErrors,
} from "@/lib/sponsor-notifications";

interface StatusBanner {
  type: "success" | "error" | "info";
  message: string;
}

const CHANNEL_OPTIONS: Array<{
  key: NotificationChannel;
  label: string;
  description: string;
  icon: typeof Bell;
}> = [
  {
    key: "inApp",
    label: "In-App Real-Time Feed",
    description:
      "Instant milestone verification alerts inside the sponsor portal.",
    icon: BellRing,
  },
  {
    key: "email",
    label: "Email Notifications",
    description: "Structured ESG summaries and milestone proofs via email.",
    icon: Mail,
  },
  {
    key: "webhook",
    label: "Webhook Integration",
    description:
      "Signed HTTPS JSON payloads for Slack, Teams, or corporate ESG systems.",
    icon: Globe,
  },
  {
    key: "push",
    label: "Browser Push Alerts",
    description:
      "Desktop and mobile push alerts even when the portal tab is inactive.",
    icon: Smartphone,
  },
];

const FREQUENCY_OPTIONS: Array<{
  value: DigestFrequency;
  label: string;
  description: string;
}> = [
  {
    value: "realtime",
    label: "Real-Time",
    description: "Deliver immediately upon on-chain verification",
  },
  {
    value: "hourly",
    label: "Hourly Digest",
    description: "Batch verified milestones once every hour",
  },
  {
    value: "daily",
    label: "Daily Digest",
    description: "Consolidated daily summary of verified impact",
  },
];

const EVENT_TYPES = Object.keys(MILESTONE_EVENT_META) as MilestoneEventType[];

export default function SponsorSettingsPage() {
  const [settings, setSettings] = useState<SponsorNotificationSettings>(
    DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
  );
  const [alerts, setAlerts] = useState<MilestoneAlertItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(
    {},
  );
  const [banner, setBanner] = useState<StatusBanner | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/sponsor/notifications", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Failed to load settings (${response.status})`);
      }
      const payload = (await response.json()) as {
        settings: SponsorNotificationSettings;
        recentAlerts?: MilestoneAlertItem[];
      };
      setSettings(payload.settings);
      if (payload.recentAlerts) {
        setAlerts(payload.recentAlerts);
      }
    } catch (error) {
      console.warn(
        "[SponsorSettingsPage] Falling back to local notification preferences:",
        error,
      );
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem(NOTIFICATION_STORAGE_KEY);
        if (stored) {
          try {
            setSettings(JSON.parse(stored) as SponsorNotificationSettings);
          } catch {
            setSettings(DEFAULT_SPONSOR_NOTIFICATION_SETTINGS);
          }
        }
      }
      setAlerts([createSampleMilestoneAlert("planting_verified")]);
      setBanner({
        type: "info",
        message:
          "Using locally cached notification preferences while offline.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleToggleMaster = () => {
    setSettings((prev) => ({ ...prev, enabled: !prev.enabled }));
    setBanner(null);
  };

  const handleToggleChannel = (channel: NotificationChannel) => {
    if (
      channel === "push" &&
      !settings.channels.push &&
      typeof window !== "undefined" &&
      !("Notification" in window)
    ) {
      console.warn(
        "[SponsorSettingsPage] Browser Push Notifications API is not supported in this environment.",
      );
      setBanner({
        type: "info",
        message:
          "Browser push notifications are not supported in this browser, but your preference can still be saved for supported devices.",
      });
    }

    setSettings((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: !prev.channels[channel],
      },
    }));
    setValidationErrors((prev) => ({ ...prev, channels: undefined }));
  };

  const handleToggleEvent = (eventType: MilestoneEventType) => {
    setSettings((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        [eventType]: !prev.events[eventType],
      },
    }));
    setValidationErrors((prev) => ({ ...prev, events: undefined }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setBanner(null);

    const errors = validateNotificationSettings(settings);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      setBanner({
        type: "error",
        message: "Please fix the highlighted validation errors before saving.",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/sponsor/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `Save failed (${response.status})`);
      }

      const payload = (await response.json()) as {
        settings: SponsorNotificationSettings;
        message?: string;
      };
      setSettings(payload.settings);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          NOTIFICATION_STORAGE_KEY,
          JSON.stringify(payload.settings),
        );
      }

      setBanner({
        type: "success",
        message:
          payload.message ||
          "Real-time planting milestone notification settings saved.",
      });
    } catch (error) {
      console.warn(
        "[SponsorSettingsPage] Failed to persist settings to API, caching locally:",
        error,
      );
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          NOTIFICATION_STORAGE_KEY,
          JSON.stringify(settings),
        );
      }
      setBanner({
        type: "error",
        message:
          error instanceof Error
            ? `${error.message}. Changes were cached locally.`
            : "Could not reach notification service. Changes were cached locally.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestAlert = async () => {
    setTesting(true);
    setBanner(null);
    const activeEvent =
      EVENT_TYPES.find((evt) => settings.events[evt]) ?? "planting_verified";

    try {
      const response = await fetch("/api/sponsor/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: activeEvent }),
      });

      if (!response.ok) {
        throw new Error(`Test alert request failed (${response.status})`);
      }

      const payload = (await response.json()) as {
        alert: MilestoneAlertItem;
        message?: string;
      };
      setAlerts((prev) => [payload.alert, ...prev].slice(0, 6));
      setBanner({
        type: "success",
        message:
          payload.message ||
          "Test planting milestone verification alert sent.",
      });
    } catch (error) {
      console.warn(
        "[SponsorSettingsPage] Test alert API failed, generating local preview:",
        error,
      );
      const localAlert = createSampleMilestoneAlert(activeEvent);
      setAlerts((prev) => [localAlert, ...prev].slice(0, 6));
      setBanner({
        type: "info",
        message:
          "Generated a local preview alert because the notification service was unreachable.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleResetDefaults = () => {
    setSettings({
      ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS,
      channels: { ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS.channels },
      events: { ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS.events },
      quietHours: { ...DEFAULT_SPONSOR_NOTIFICATION_SETTINGS.quietHours },
    });
    setValidationErrors({});
    setBanner({
      type: "info",
      message: "Notification preferences reset to defaults. Save to apply.",
    });
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            Real-Time Milestone Alerts
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Sponsor Notification Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure real-time alerts when planting milestones are verified for
            farmers and community stewards across your sponsored pools.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={() => void handleSendTestAlert()}
            disabled={testing || !settings.enabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {testing ? "Sending..." : "Send Test Alert"}
          </button>
        </div>
      </header>

      {/* Accessible Status Banner */}
      {banner ? (
        <div
          role={banner.type === "error" ? "alert" : "status"}
          aria-live={banner.type === "error" ? "assertive" : "polite"}
          data-testid="notification-status-banner"
          className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm ${
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              : banner.type === "error"
                ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
          }`}
        >
          {banner.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : banner.type === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{banner.message}</span>
        </div>
      ) : null}

      {loading ? (
        <div
          data-testid="settings-loading"
          className="space-y-4 rounded-xl border bg-card p-6"
          aria-busy="true"
        >
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-6" noValidate>
          {/* Master Toggle Card */}
          <section
            aria-labelledby="master-toggle-heading"
            className="flex flex-col gap-4 rounded-xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2
                id="master-toggle-heading"
                className="text-base font-semibold text-foreground"
              >
                Real-Time Milestone Verification Alerts
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pause or resume all planting milestone notifications across
                configured channels.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              aria-label="Enable real-time milestone verification alerts"
              onClick={handleToggleMaster}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                settings.enabled ? "bg-emerald-600" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  settings.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </section>

          {/* Delivery Channels */}
          <section
            aria-labelledby="channels-heading"
            className="space-y-4 rounded-xl border bg-card p-6"
          >
            <div>
              <h2
                id="channels-heading"
                className="text-base font-semibold text-foreground"
              >
                Delivery Channels
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose how your organization receives verified planting
                milestone updates.
              </p>
            </div>

            {validationErrors.channels ? (
              <p role="alert" className="text-xs font-medium text-red-600">
                {validationErrors.channels}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {CHANNEL_OPTIONS.map(({ key, label, description, icon: Icon }) => {
                const active = settings.channels[key];
                return (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                      active
                        ? "border-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-950/20"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => handleToggleChannel(key)}
                      disabled={!settings.enabled}
                      className="mt-1 h-4 w-4 rounded border-muted-foreground text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Icon
                          className="h-4 w-4 text-emerald-600"
                          aria-hidden="true"
                        />
                        <span>{label}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Channel Destination Inputs */}
            <div className="grid gap-4 pt-2 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="sponsor-email"
                  className="block text-xs font-medium text-foreground"
                >
                  Alert Email Address
                </label>
                <input
                  id="sponsor-email"
                  type="email"
                  value={settings.emailAddress}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      emailAddress: e.target.value,
                    }));
                    setValidationErrors((prev) => ({
                      ...prev,
                      emailAddress: undefined,
                    }));
                  }}
                  disabled={!settings.enabled || !settings.channels.email}
                  placeholder="esg-alerts@organization.org"
                  aria-invalid={Boolean(validationErrors.emailAddress)}
                  className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                />
                {validationErrors.emailAddress ? (
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    {validationErrors.emailAddress}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="sponsor-webhook"
                  className="block text-xs font-medium text-foreground"
                >
                  HTTPS Webhook URL
                </label>
                <input
                  id="sponsor-webhook"
                  type="url"
                  value={settings.webhookUrl}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      webhookUrl: e.target.value,
                    }));
                    setValidationErrors((prev) => ({
                      ...prev,
                      webhookUrl: undefined,
                    }));
                  }}
                  disabled={!settings.enabled || !settings.channels.webhook}
                  placeholder="https://hooks.example.com/farm-credit"
                  aria-invalid={Boolean(validationErrors.webhookUrl)}
                  className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                />
                {validationErrors.webhookUrl ? (
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    {validationErrors.webhookUrl}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Milestone Event Subscriptions */}
          <section
            aria-labelledby="events-heading"
            className="space-y-4 rounded-xl border bg-card p-6"
          >
            <div>
              <h2
                id="events-heading"
                className="text-base font-semibold text-foreground"
              >
                Planting Milestone Events
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Select which on-chain and verifier-attested milestones trigger
                alerts.
              </p>
            </div>

            {validationErrors.events ? (
              <p role="alert" className="text-xs font-medium text-red-600">
                {validationErrors.events}
              </p>
            ) : null}

            <div className="space-y-3">
              {EVENT_TYPES.map((eventType) => {
                const meta = MILESTONE_EVENT_META[eventType];
                return (
                  <label
                    key={eventType}
                    className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-4 transition hover:bg-muted/40"
                  >
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {meta.label}
                      </span>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.events[eventType]}
                      onChange={() => handleToggleEvent(eventType)}
                      disabled={!settings.enabled}
                      className="mt-1 h-4 w-4 rounded border-muted-foreground text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                );
              })}
            </div>
          </section>

          {/* On-Chain Filtering, Cadence & Quiet Hours */}
          <section
            aria-labelledby="filters-heading"
            className="space-y-5 rounded-xl border bg-card p-6"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck
                className="h-5 w-5 text-emerald-600"
                aria-hidden="true"
              />
              <div>
                <h2
                  id="filters-heading"
                  className="text-base font-semibold text-foreground"
                >
                  Stellar Account Filter & Delivery Cadence
                </h2>
                <p className="text-xs text-muted-foreground">
                  Scope alerts to a specific Stellar benefactor address and
                  control alert frequency.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="stellar-account"
                  className="block text-xs font-medium text-foreground"
                >
                  Stellar Benefactor Public Key (Optional)
                </label>
                <input
                  id="stellar-account"
                  type="text"
                  value={settings.stellarAccount}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      stellarAccount: e.target.value,
                    }));
                    setValidationErrors((prev) => ({
                      ...prev,
                      stellarAccount: undefined,
                    }));
                  }}
                  disabled={!settings.enabled}
                  placeholder="G..."
                  aria-invalid={Boolean(validationErrors.stellarAccount)}
                  className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs text-foreground disabled:opacity-50"
                />
                {validationErrors.stellarAccount ? (
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    {validationErrors.stellarAccount}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="min-trees-threshold"
                  className="block text-xs font-medium text-foreground"
                >
                  Minimum Verified Trees Threshold
                </label>
                <input
                  id="min-trees-threshold"
                  type="number"
                  min={1}
                  max={100000}
                  value={settings.minVerifiedTreesThreshold}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      minVerifiedTreesThreshold: Number(e.target.value),
                    }));
                    setValidationErrors((prev) => ({
                      ...prev,
                      minVerifiedTreesThreshold: undefined,
                    }));
                  }}
                  disabled={!settings.enabled}
                  aria-invalid={Boolean(
                    validationErrors.minVerifiedTreesThreshold,
                  )}
                  className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                />
                {validationErrors.minVerifiedTreesThreshold ? (
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    {validationErrors.minVerifiedTreesThreshold}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Cadence */}
            <div>
              <span className="block text-xs font-medium text-foreground">
                Delivery Frequency
              </span>
              <div
                role="radiogroup"
                aria-label="Notification delivery frequency"
                className="mt-2 grid gap-3 sm:grid-cols-3"
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer flex-col rounded-lg border p-3 transition ${
                      settings.frequency === option.value
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="frequency"
                        value={option.value}
                        checked={settings.frequency === option.value}
                        onChange={() =>
                          setSettings((prev) => ({
                            ...prev,
                            frequency: option.value,
                          }))
                        }
                        disabled={!settings.enabled}
                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                    </div>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Quiet Hours */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Clock
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      Quiet Hours
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Defer non-critical push and email alerts during off-hours.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  aria-label="Enable quiet hours"
                  checked={settings.quietHours.enabled}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      quietHours: {
                        ...prev.quietHours,
                        enabled: e.target.checked,
                      },
                    }))
                  }
                  disabled={!settings.enabled}
                  className="h-4 w-4 rounded border-muted-foreground text-emerald-600 focus:ring-emerald-500"
                />
              </div>

              {settings.quietHours.enabled ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="quiet-start"
                      className="block text-xs text-muted-foreground"
                    >
                      Start Time (UTC)
                    </label>
                    <input
                      id="quiet-start"
                      type="time"
                      value={settings.quietHours.start}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          quietHours: {
                            ...prev.quietHours,
                            start: e.target.value,
                          },
                        }))
                      }
                      className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="quiet-end"
                      className="block text-xs text-muted-foreground"
                    >
                      End Time (UTC)
                    </label>
                    <input
                      id="quiet-end"
                      type="time"
                      value={settings.quietHours.end}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          quietHours: {
                            ...prev.quietHours,
                            end: e.target.value,
                          },
                        }))
                      }
                      className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {/* Submit Bar */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? "Saving..." : "Save Notification Settings"}
            </button>
          </div>
        </form>
      )}

      {/* Live Real-Time Alert Preview Feed */}
      <section
        aria-labelledby="live-feed-heading"
        className="space-y-3 rounded-xl border bg-card p-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="live-feed-heading"
              className="text-base font-semibold text-foreground"
            >
              Recent Verified Milestone Alerts
            </h2>
            <p className="text-xs text-muted-foreground">
              Live preview of real-time notifications emitted when planting
              milestones are verified.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {alerts.length} {alerts.length === 1 ? "alert" : "alerts"}
          </span>
        </div>

        <ul
          data-testid="milestone-alert-feed"
          aria-live="polite"
          className="space-y-2.5"
        >
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className="rounded-lg border bg-background p-3.5 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {alert.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  Ledger #{alert.ledgerSequence.toLocaleString("en-US")}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {alert.message}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Steward: {alert.stewardName}</span>
                <span>Pool: {alert.poolName}</span>
                <span>Verified: {alert.treesVerified} trees</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
