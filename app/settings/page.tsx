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
import { cn } from '@/lib/utils';
import { PreferencesSection } from '@/components/organisms/settings/PreferencesSection';

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
  return (
    <div>
      <Text variant="muted">Notification settings coming soon.</Text>
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
