import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TreeGrowthTimeline } from '@/components/organisms/TreeGrowthTimeline/TreeGrowthTimeline';
import { getMockTrees } from '@/lib/api/mock/trees';
import { buildTreeGrowthTimeline } from '@/lib/tree-growth/timeline';

export function generateStaticParams() {
  return getMockTrees().map((tree) => ({ id: tree.id }));
}

export const metadata: Metadata = {
  title: 'Tree growth story',
  description:
    'Sponsor story — month-by-month growth photos, milestones, and impact metrics for your sponsored tree.',
};

/**
 * Route: /trees/[id]/timeline
 *
 * Immersive sponsor story for one sponsored tree (Issue #1102).
 */
export default async function TreeGrowthStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tree = getMockTrees().find((entry) => entry.id === id || entry.treeId === id);

  if (!tree) {
    notFound();
  }

  const timeline = buildTreeGrowthTimeline(tree);

  return (
    <main className="min-h-screen bg-background">
      <TreeGrowthTimeline timeline={timeline} backHref={`/trees/${tree.id}`} />
    </main>
  );
}
