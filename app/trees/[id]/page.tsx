import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TreeDetail } from '@/components/organisms/TreeDetail/TreeDetail';
import { getMockTrees } from '@/lib/api/mock/trees';
import { getTreeById } from '@/lib/api/tree-registry';

export function generateStaticParams() {
  return getMockTrees().map((tree) => ({ id: tree.id }));
}

/** Metadata — including dynamic OpenGraph image — for each tree page. Closes #1109 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  // Best-effort fetch; fall back to defaults on error
  const tree = await getTreeById(id).catch(() => null);

  const species = tree?.species ?? 'Tree';
  const region = tree?.region ?? 'Africa';
  const projectName = tree?.projectName ?? 'FarmCredit Reforestation';
  const treeId = tree?.treeId ?? id;

  const title = `${species} Tree — ${projectName}`;
  const description = `A ${species} tree planted in ${region} as part of the ${projectName} project. Tree ID: ${treeId}. Track its growth and carbon impact on FarmCredit.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [
        {
          url: `/trees/${id}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${species} tree in ${region} — FarmCredit`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`/trees/${id}/opengraph-image`],
    },
  };
}

export default async function TreeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tree = getMockTrees().find((t) => t.id === id || t.treeId === id);

  if (!tree) {
    notFound();
  }

  return <TreeDetail tree={tree} />;
}
