import type { Metadata } from 'next';
import { FarmerSuccessStories } from '@/components/organisms/FarmerSuccessStories';

export const metadata: Metadata = {
  title: 'Farmer Success Stories | FarmCredit',
  description:
    'Case studies of farmers restoring degraded land through FarmCredit carbon projects — income earned, land transformation, and environmental impact achieved.',
  openGraph: {
    title: 'Farmer Success Stories | FarmCredit',
    description:
      'Real farmers restoring degraded land: verified income earned, land transformation, and environmental impact.',
    type: 'website',
  },
};

export default function SuccessStoriesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <FarmerSuccessStories />
    </main>
  );
}
