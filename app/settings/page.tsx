import { NotificationSection } from "@/components/organisms/settings/NotificationSection";
import { PreferencesSection } from "@/components/organisms/settings/PreferencesSection";
import { ProfileSection } from "@/components/organisms/settings/ProfileSection";


export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stellar-navy tracking-tight ">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account, preferences, and security.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          <ProfileSection />
          <NotificationSection />
            <PreferencesSection />
        </div>
      </div>
    </main>
  );
}