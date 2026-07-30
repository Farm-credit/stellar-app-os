import { notFound } from 'next/navigation';
import { TreeDetail } from '@/components/organisms/TreeDetail/TreeDetail';
import { getMockTrees } from '@/lib/api/mock/trees';

export function generateStaticParams() {
  return getMockTrees().map((tree) => ({ id: tree.id }));
}

export default async function TreeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tree = getMockTrees().find((t) => t.id === id || t.treeId === id);

  if (!tree) {
    notFound();
  }

  return <TreeDetail tree={tree} />;
}
