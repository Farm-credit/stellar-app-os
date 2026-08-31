import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPlanterById, getAllPlanters } from '@/lib/api/planters';
import { PlanterProfileView } from '@/components/organisms/PlanterProfileView';

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamicParams = true;

export function generateStaticParams() {
  return getAllPlanters().map((planter) => ({ id: planter.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const planter = getPlanterById(id);
  if (!planter) return { title: 'Planter Not Found | FarmCredit' };
  return {
    title: `${planter.fullName} — ${planter.role} | FarmCredit`,
    description: planter.tagline,
    openGraph: {
      title: `${planter.fullName} — ${planter.role}`,
      description: planter.tagline,
      images: [planter.avatarUrl],
    },
  };
}

export default async function PlanterPage({ params }: Props) {
  const { id } = await params;
  const planter = getPlanterById(id);
  if (!planter) notFound();

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 md:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <PlanterProfileView planter={planter} />
      </div>
    </main>
  );
}
