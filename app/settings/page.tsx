'use client';

import { useEffect, useState } from 'react';
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
import '@/lib/utils';
import { PreferencesSection } from '@/components/organisms/settings/PreferencesSection';
import { Switch } from '@/components/atoms/Switch';
import { useNotifications } from '@/contexts/NotificationContext';
import { notificationsSchema } from '@/lib/validation/notifications';

type TabId = 'profile' | 'notifications' | 'preferences' | 'danger';

interface NavItem {
  id: TabId;
  label: string;
  icon?: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'preferences', label: 'Preferences', icon: '⚙️' },
  { id: 'danger', label: 'Danger Zone', icon: '⚠️' },
];

const SECTION_TITLES: Record<TabId, string> = {
  profile: 'Profile',
  notifications: 'Notifications',
  preferences: 'Preferences',
  danger: 'Danger Zone',
};

function ProfileSection() {
  return (
    <div>
      <Text variant="muted">Profile settings coming soon.</Text>
    </div>
  );
}

function NotificationSection() {
  const { preferences, setNewsletterOptIn, updatePreferences } = useNotifications();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (next: typeof preferences): boolean => {
    const result = notificationsSchema.safeParse(next);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleToggle = (key: 'email' | 'push' | 'sms', value: boolean) => {
    const next = { ...preferences, [key]: value };
    if (validate(next)) {
      updatePreferences({ [key]: value });
    }
  };

  const handleNewsletterToggle = (value: boolean) => {
    const next = { ...preferences, newsletter: value };
    if (validate(next)) {
      setNewsletterOptIn(value);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Text as="p" className="font-medium">
              Email notifications
            </Text>
            <Text variant="muted" as="p" className="text-sm">
              Receive updates about your trees and account by email.
            </Text>
            {errors.email && (
              <Text variant="small" as="p" className="text-destructive">
                {errors.email}
              </Text>
            )}
          </div>
          <Switch
            checked={preferences.email}
            onCheckedChange={(value) => handleToggle('email', value)}
            aria-label="Email notifications"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Text as="p" className="font-medium">
              Push notifications
            </Text>
            <Text variant="muted" as="p" className="text-sm">
              Get real-time alerts in your browser.
            </Text>
            {errors.push && (
              <Text variant="small" as="p" className="text-destructive">
                {errors.push}
              </Text>
            )}
          </div>
          <Switch
            checked={preferences.push}
            onCheckedChange={(value) => handleToggle('push', value)}
            aria-label="Push notifications"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Text as="p" className="font-medium">
              SMS notifications
            </Text>
            <Text variant="muted" as="p" className="text-sm">
              Receive important updates via text message.
            </Text>
            {errors.sms && (
              <Text variant="small" as="p" className="text-destructive">
                {errors.sms}
              </Text>
            )}
          </div>
          <Switch
            checked={preferences.sms}
            onCheckedChange={(value) => handleToggle('sms', value)}
            aria-label="SMS notifications"
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Text as="p" className="font-medium">
              Monthly forest health newsletter
            </Text>
            <Text variant="muted" as="p" className="text-sm">
              Curated platform news, reforestation stories, species spotlights, conservation tips,
              and updates on your own trees.
            </Text>
            {errors.newsletter && (
              <Text variant="small" as="p" className="text-destructive">
                {errors.newsletter}
              </Text>
            )}
          </div>
          <Switch
            checked={preferences.newsletter}
            onCheckedChange={handleNewsletterToggle}
            aria-label="Monthly forest health newsletter"
          />
        </div>
      </div>
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
            <nav
              className="flex flex-row gap-1 sm:flex-col"
              role="tablist"
              aria-label="Settings sections"
            >
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
            <h2 className="mb-6 text-lg font-semibold text-foreground">
              {SECTION_TITLES[activeTab]}
            </h2>
            {activeTab === 'profile' && <ProfileSection />}
            {activeTab === 'notifications' && <NotificationSection />}
            {activeTab === 'preferences' && <PreferencesSection />}
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
