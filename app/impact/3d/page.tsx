import type { Metadata } from 'next';
import { ImpactModel3D } from '@/components/organisms/ImpactModel3D/ImpactModel3D';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';

export const metadata: Metadata = {
  title: '3D Project Impact Model | Farm-credit',
  description:
    'Explore an offset project in 3D: forest growth over time, soil sequestration depth and the emissions reduction rate.',
};

type PageProps = {
  searchParams?: Promise<{ project?: string }> | { project?: string };
};

export default async function ImpactModel3DPage({ searchParams }: PageProps) {
  const params = await Promise.resolve(searchParams ?? {});
  const initialProjectId =
    typeof params.project === 'string' && params.project.length > 0
      ? params.project
      : undefined;

  return (
    <main className="container mx-auto px-4 py-8">
      <ImpactModel3D
        projects={mockCarbonProjects}
        initialProjectId={initialProjectId}
      />
    </main>
  );
}
