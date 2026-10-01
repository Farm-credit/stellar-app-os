import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARTreeViewer } from '@/components/organisms/ARTreeViewer/ARTreeViewer';
import { getMockTrees } from '@/lib/api/mock/trees';
import { buildTreeARProjection } from '@/lib/ar/projection';

export function generateStaticParams() {
  return getMockTrees().map((tree) => ({ id: tree.id }));
}

export const metadata: Metadata = {
  title: 'View your tree in AR',
  description:
    'Augmented reality — see your sponsored tree at 20-year maturity using AR overlays in your mobile browser.',
};

/**
 * Route: /trees/[id]/ar
 *
 * WebAR 20-year growth view for one sponsored tree (Issue #1106).
 */
export default async function TreeARPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tree = getMockTrees().find((entry) => entry.id === id || entry.treeId === id);

  if (!tree) {
    notFound();
  }

  const projection = buildTreeARProjection(tree);

  return (
    <main className="min-h-screen bg-background">
      <ARTreeViewer projection={projection} backHref={`/trees/${tree.id}`} />
    </main>
  );
}
