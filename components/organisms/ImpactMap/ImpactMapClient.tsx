'use client';

import dynamic from 'next/dynamic';
import type { RegionMarker } from '@/lib/api/impactData';
import type { Tree } from '@/lib/types/tree';

const ImpactMapInner = dynamic(
  () => import('@/components/organisms/ImpactMap/ImpactMap').then((m) => m.ImpactMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-muted" />,
  }
);

export function ImpactMapClient({
  regions,
  trees = [],
}: {
  regions: RegionMarker[];
  trees?: Tree[];
}) {
  return <ImpactMapInner regions={regions} trees={trees} />;
}
