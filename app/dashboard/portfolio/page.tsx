import type { Metadata } from 'next';
import { SponsorImpactHub } from '@/components/organisms/SponsorImpact/SponsorImpactHub';
export const metadata: Metadata = {
  title: 'Forest Portfolio | Dashboard',
  description: 'Unified portfolio view for every forest and tree you sponsor.',
};
export default function PortfolioPage() {
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <SponsorImpactHub initialTab="portfolio" />
      </div>
    </main>
  );
}
