import type { Metadata } from 'next';
import { BuyerRecommendations } from '@/components/organisms/BuyerRecommendations/BuyerRecommendations';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';

export const metadata: Metadata = {
  title: 'Recommended Projects | Farm-credit',
  description:
    'Offset project suggestions matched to your industry, company size, past purchases, co-benefit preferences and budget.',
};

export default function RecommendationsPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <BuyerRecommendations projects={mockCarbonProjects} />
    </main>
  );
}
