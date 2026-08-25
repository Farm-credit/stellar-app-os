import { type Metadata } from 'next';
import { Suspense } from 'react';
import { MyForestDashboardPage } from './MyForestDashboardPage';

export const metadata: Metadata = {
  title: 'My Forest | Dashboard',
  description:
    'View and manage all of your sponsored trees — status badges, species breakdown, CO₂ offset, and links to individual tree detail pages.',
};

/**
 * Route: /dashboard/trees
 * Renders the sponsor "My Forest" dashboard page (Issue #525).
 */
export default function SponsorTreesPage() {
  return (
    <main
      className="min-h-screen bg-background pt-24 pb-16 px-4 md:px-8 lg:px-12"
      aria-label="My Forest dashboard"
    >
      <div className="max-w-7xl mx-auto">
        {/*
         * Suspense wrapper is required because MyForestDashboardPage reads
         * URL search params via useSearchParams() (a client-side hook that
         * suspends during server rendering).
         */}
        <Suspense
          fallback={
            <div
              className="flex items-center justify-center min-h-[400px]"
              role="status"
              aria-live="polite"
              aria-label="Loading your forest"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-stellar-green/10 animate-pulse" />
                <p className="text-sm text-muted-foreground font-medium">Loading your forest…</p>
              </div>
            </div>
          }
        >
          <MyForestDashboardPage />
        </Suspense>
      </div>
    </main>
  );
}
