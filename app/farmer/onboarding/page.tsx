import type { Metadata } from 'next';
import { FarmerOnboardingWizard } from '@/components/organisms/FarmerOnboardingWizard/FarmerOnboardingWizard';

export const metadata: Metadata = {
  title: 'Farmer onboarding | FarmCredit',
  description:
    'Guide new farmers through a polished multi-step onboarding experience for identity and land registration.',
};

export default function FarmerOnboardingPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,182,231,0.16),_transparent_45%),linear-gradient(135deg,_rgba(13,11,33,0.98),_rgba(13,11,33,0.92))] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <FarmerOnboardingWizard />
      </div>
    </main>
  );
}
