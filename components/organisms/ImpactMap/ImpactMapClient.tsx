'use client';

import dynamic from 'next/dynamic';
import type { RegionMarker } from '@/app/api/impact/route';

const ImpactMapInner = dynamic(
  () => import('@/components/organisms/ImpactMap/ImpactMap').then((m) => m.ImpactMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-muted" />,
  }
);

export function ImpactMapClient({ regions }: { regions: RegionMarker[] }) {
  return <ImpactMapInner regions={regions} />;
}
