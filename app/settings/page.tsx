'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { hasCompletedOnboardingTour, requestOnboardingTourRestart } from '@/lib/onboardingTour';
import { cn } from '@/lib/utils';
import { PreferencesSection } from '@/components/organisms/settings/PreferencesSection';
import { RecognitionSection } from '@/components/organisms/settings/RecognitionSection';
import { useTimeZone } from '@/contexts/TimeZoneContext';
import { nextDigestSendTime } from '@/lib/digest';
import { useNotifications } from '@/contexts/NotificationContext';
import { settingsApi } from '@/lib/api/settings';

type TabId = 'profile' | 'notifications' | 'preferences' | 'recognition' | 'danger';

interface NavItem {
  id: TabId;
  label: string;
  icon?: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'preferences', label: 'Preferences', icon: '⚙️' },
  { id: 'recognition', label: 'Recognition', icon: '🌳' },
  { id: 'danger', label: 'Danger Zone', icon: '⚠️' },
];

const SECTION_TITLES: Record<TabId, string> = {
  profile: 'Profile',
  notifications: 'Notifications',
  preferences: 'Preferences',
  recognition: 'Recognition',
  danger: 'Danger Zone',
};

function ProfileSection() {
  return (
    <div>
      <Text variant="muted">Profile settings coming soon.</Text>
    </div>
  );
}

interface DigestPreferences {
  digestEnabled: boolean;
  timeZone: string;
}

const COMMON_TIME_ZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Africa/Nairobi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
];

function formatSendTime(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function NotificationSection() {
  const { timeZone, setTimeZone } = useTimeZone();
  const { refresh: refreshNotifications } = useNotifications();
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = await settingsApi.getNotificationPreferences();
        if (cancelled) return;
        setDigestEnabled(prefs.digestEnabled ?? true);
        if (prefs.timeZone && prefs.timeZone !== timeZone) {
          setTimeZone(prefs.timeZone);
        }
      } catch {
        if (!cancelled) setError('Unable to load notification preferences.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    async (next: DigestPreferences) => {
      setSaving(true);
      setError(null);
      try {
        await settingsApi.updateNotificationPreferences(next);
        setSavedAt(new Date());
        await refreshNotifications();
      } catch {
        setError('Unable to save notification preferences.');
      } finally {
        setSaving(false);
      }
    },
    [refreshNotifications],
  );

  const handleToggleDigest = () => {
    const next = !digestEnabled;
    setDigestEnabled(next);
    void persist({ digestEnabled: next, timeZone });
  };

  const handleTimeZoneChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    setTimeZone(next);
    void persist({ digestEnabled, timeZone: next });
  };

  const nextSend = digestEnabled ? nextDigestSendTime(timeZone) : null;
  const timeZoneOptions = COMMON_TIME_ZONES.includes(timeZone)
    ? COMMON_TIME_ZONES
    : [timeZone, ...COMMON_TIME_ZONES];

  if (loading) {
    return (
      <div>
        <Text variant="muted">Loading notification preferences…</Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Text variant="h4" as="h3">
          Daily Digest
        </Text>
        <Text variant="muted" as="p">
          Instead of an email for every event, receive a single daily summary at 9:00 AM in your
          timezone.
        </Text>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
        <div className="min-w-0">
          <Text variant="small" as="p" className="font-medium">
            Email me a daily digest
          </Text>
          <Text variant="muted" as="p" className="mt-1">
            {digestEnabled
              ? `Next digest: ${formatSendTime(nextSend)}`
              : 'Digest emails are turned off.'}
          </Text>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={digestEnabled}
          aria-label="Enable daily digest"
          disabled={saving}
          onClick={handleToggleDigest}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
            digestEnabled ? 'bg-primary' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform',
              digestEnabled ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>

      <div className="space-y-2">
        <label htmlFor="digest-timezone" className="block text-sm font-medium text-foreground">
          Timezone
        </label>
        <select
          id="digest-timezone"
          value={timeZone}
          disabled={saving}
          onChange={handleTimeZoneChange}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
        >
          {timeZoneOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <Text variant="muted" as="p">
          Digests are sent at 9:00 AM in this timezone.
        </Text>
      </div>

      {error && (
        <Text variant="small" as="p" className="text-destructive">
          {error}
        </Text>
      )}
      {savedAt && !error && (
        <Text variant="muted" as="p">
          Saved.
        </Text>
      )}
    </div>
  );
}

function DeleteAccountSection() {
  return (
    <div>
      <Text variant="muted">Account deletion options coming soon.</Text>
    </div>
  );
}

export default function SettingsPage(): ReactNode {
  const router = useRouter();
  const [tourCompleted, setTourCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  useEffect(() => {
    setTourCompleted(hasCompletedOnboardingTour());
  }, []);

  const restartTour = () => {
    requestOnboardingTourRestart();
    setTourCompleted(false);
    router.push('/');
  };

  return (
    <main id="main-content" className="container mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <Text variant="h2" as="h1" className="mb-2">
          Settings
        </Text>
        <Text variant="muted" as="p">
          Manage onboarding and account preferences.
        </Text>
      </div>

      <div className="rounded-lg border bg-background p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
          <aside className="w-full shrink-0 sm:w-48 lg:w-52">
            <nav className="flex flex-row gap-1 sm:flex-col" role="tablist" aria-label="Settings sections">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={activeTab === item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all ${
                    activeTab === item.id
                      ? item.id === 'danger'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-secondary text-primary'
                      : item.id === 'danger'
                        ? 'text-destructive/70 hover:bg-destructive/10 hover:text-destructive'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="flex-1 min-w-0" role="tabpanel">
            <h2 className="mb-6 text-lg font-semibold text-foreground">{SECTION_TITLES[activeTab]}</h2>
            {activeTab === 'profile' && <ProfileSection />}
            {activeTab === 'notifications' && <NotificationSection />}
            {activeTab === 'preferences' && <PreferencesSection />}
            {activeTab === 'recognition' && <RecognitionSection />}
            {activeTab === 'danger' && <DeleteAccountSection />}
          </div>
        </div>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Onboarding Tour</CardTitle>
          <CardDescription>Restart the guided product tour at any time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Text variant="small" as="p">
            Status: {tourCompleted ? 'Completed' : 'Not completed'}
          </Text>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button stellar="primary" onClick={restartTour}>
              Restart Tour
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
