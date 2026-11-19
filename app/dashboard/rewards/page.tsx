import type { Metadata } from 'next';
import { SponsorImpactHub } from '@/components/organisms/SponsorImpact/SponsorImpactHub';
export const metadata: Metadata = {
  title: 'Sponsor Rewards | Dashboard',
  description: 'Earn and redeem loyalty points for trees and eco-products.',
};
export default function RewardsPage() {
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <SponsorImpactHub initialTab="rewards" />
      </div>
    </main>
  );
}
