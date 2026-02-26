'use client';

import { useState, useEffect } from 'react';
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
import { DeleteAccountSection } from '@/components/organisms/settings/DeleteAccountSection';
import { NotificationSection } from '@/components/organisms/settings/NotificationSection';
import { PreferencesSection } from '@/components/organisms/settings/PreferencesSection';
import { ProfileSection } from '@/components/organisms/settings/ProfileSection';
import { User, Bell, Sliders, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavItem, SECTION_TITLES, TabId } from '@/types/settings';

const NAV_ITEMS: NavItem[] = [
  { id: 'profile', label: 'My Profile', icon: <User className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  { id: 'preferences', label: 'Preferences', icon: <Sliders className="h-4 w-4" /> },
  { id: 'danger', label: 'Delete Account', icon: <Trash2 className="h-4 w-4" /> },
];

export default function SettingsPage(): React.ReactNode {
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
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <Text variant="h2" as="h1" className="mb-2">
          Settings
        </Text>
        <Text variant="muted" as="p">
          Manage onboarding and account preferences.
        </Text>
      </div>

      <main className="bg-background">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
            {/* Sidebar nav */}
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
                    className={cn(
                      'flex w-full items-center cursor-pointer gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all text-left',
                      activeTab === item.id
                        ? item.id === 'danger'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-secondary text-primary'
                        : item.id === 'danger'
                          ? 'text-destructive/70 hover:bg-destructive/10 hover:text-destructive'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'hidden sm:block h-1.5 w-1.5 shrink-0 rounded-full transition-all',
                        activeTab === item.id
                          ? item.id === 'danger'
                            ? 'bg-destructive'
                            : 'bg-primary'
                          : 'bg-transparent'
                      )}
                    />
                    <span className="hidden sm:inline">{item.label}</span>

                    <span className="sm:hidden">{item.icon}</span>
                  </button>
                ))}
              </nav>
            </aside>

            {/* Divider */}
            <div className="hidden sm:block w-px bg-border shrink-0" />

            {/* Content */}
            <div className="flex-1 min-w-0" role="tabpanel">
              {/* Section title */}
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
      </main>

      <Card>
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
    </div>
  );
}
