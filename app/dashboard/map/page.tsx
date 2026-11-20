import { type Metadata } from 'next';
import { SponsoredTreeMapClient } from '@/components/organisms/SponsoredTreeMap/SponsoredTreeMapClient';

export const metadata: Metadata = {
  title: 'Sponsored Tree Map | Dashboard',
  description:
    'Interactive map of sponsored tree planting locations. Filter by species, planting year, and sponsor organisation.',
};

/**
 * Route: /dashboard/map
 * Displays an interactive map of sponsored trees — Issue #1619.
 */
export default function SponsoredTreeMapPage() {
  return (
    <main
      className="min-h-screen bg-background pt-24 pb-16 px-4 md:px-8 lg:px-12"
      aria-label="Sponsored tree map"
    >
      <div className="max-w-7xl mx-auto">
        <SponsoredTreeMapClient />
      </div>
    </main>
  );
}
