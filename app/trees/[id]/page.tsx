import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Smartphone } from 'lucide-react';
import { TreeDetail } from '@/components/organisms/TreeDetail/TreeDetail';
import { ConnectedTreeHealthAlertToggle } from '@/components/molecules/ConnectedTreeHealthAlertToggle';
import { ConnectedTreeMessagePanel } from '@/components/organisms/TreeMessagePanel/ConnectedTreeMessagePanel';
import { TreeQRLabel } from '@/components/organisms/TreeQRLabel';
import { TreeMilestoneShareCards } from '@/components/organisms/TreeMilestoneShareCards';
import { getMockTrees } from '@/lib/api/mock/trees';
import { getTreeById } from '@/lib/api/tree-registry';
import {
  cumulativeCo2Kg,
  estimateTreeSequestration,
  inferClimateZone,
} from '@/lib/carbon/ipcc-tier1';
import { getReachedTreeMilestones } from '@/lib/trees/milestones';

/** Re-render daily so the age-based CO₂ figures keep up as the tree grows. */
export const revalidate = 86400;

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

  const sequestration = estimateTreeSequestration({
    species: tree.species,
    climateZone: tree.climateZone ?? inferClimateZone(tree.species, tree.lat),
    plantedAt: tree.plantedAt,
  });
  const climateZone = tree.climateZone ?? inferClimateZone(tree.species, tree.lat);
  const reachedMilestones = getReachedTreeMilestones(tree.plantedAt).map((milestone) => ({
    ...milestone,
    co2Kg: cumulativeCo2Kg(tree.species, climateZone, milestone.ageYears),
  }));
  const publicTreePath = `/trees/${encodeURIComponent(tree.id)}`;

  return (
    <>
      <TreeDetail tree={tree} sequestration={sequestration} />

      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-8">
        <TreeQRLabel tree={tree} />
        <TreeMilestoneShareCards
          treePublicUrl={publicTreePath}
          treeIdLabel={tree.treeId}
          species={tree.species}
          sponsorName={tree.sponsorName?.trim() || 'Tree Sponsor'}
          milestones={reachedMilestones}
        />
      </div>

      {/* Sponsor ↔ field team messaging (Issue #1686) */}
      <div className="mx-auto max-w-3xl px-4 pb-6">
        <ConnectedTreeMessagePanel treeId={tree.id} />
      </div>

      {/* Tree health push alerts (Issue #1698) */}
      <div className="mx-auto max-w-3xl px-4 pb-6">
        <ConnectedTreeHealthAlertToggle />
      </div>

      {/* WebAR 20-year growth view (Issue #1106) */}
      <div className="mx-auto -mt-4 max-w-3xl px-4 pb-10 sm:pb-12">
        <Link
          href={`/trees/${tree.id}/ar`}
          className="group flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted"
        >
          <span className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-stellar-green" aria-hidden />
            <span>
              <span className="block font-semibold">View in AR</span>
              <span className="block text-sm text-muted-foreground">
                See this tree at 20-year maturity overlaid on your surroundings.
              </span>
            </span>
          </span>
          <ArrowRight
            className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
    </>
  );
}
