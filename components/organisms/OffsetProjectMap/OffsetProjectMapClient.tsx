'use client';

import dynamic from 'next/dynamic';
import type { CarbonProject } from '@/lib/types/carbon';
import type { OffsetProjectMapFilters } from './OffsetProjectMap';

const OffsetProjectMapInner = dynamic(
  () =>
    import('@/components/organisms/OffsetProjectMap/OffsetProjectMap').then(
      (m) => m.OffsetProjectMap
    ),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-muted" />,
  }
);

export interface OffsetProjectMapClientProps {
  projects: CarbonProject[];
  filters: OffsetProjectMapFilters;
  className?: string;
}

export function OffsetProjectMapClient({
  projects,
  filters,
  className,
}: OffsetProjectMapClientProps) {
  return <OffsetProjectMapInner projects={projects} filters={filters} className={className} />;
}
