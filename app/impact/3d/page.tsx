import type { Metadata } from 'next';
import { ImpactModel3D } from '@/components/organisms/ImpactModel3D/ImpactModel3D';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';

export const metadata: Metadata = {
  title: '3D Project Impact Model | Farm-credit',
  description:
    'Explore an offset project in 3D: forest growth over time, soil sequestration depth and the emissions reduction rate.',
};

export default function ImpactModel3DPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <ImpactModel3D projects={mockCarbonProjects} />
    </main>
  );
}
