'use client';

import dynamic from 'next/dynamic';
import type { PlantingLocation } from '@/lib/db/schema';

const PlantingMapInner = dynamic(
  () => import('@/components/organisms/PlantingMap/PlantingMap').then((m) => m.PlantingMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-full w-full animate-pulse rounded-xl bg-muted"
        style={{ minHeight: '480px' }}
        aria-label="Map loading"
        role="status"
      />
    ),
  }
);

interface PlantingMapClientProps {
  locations: PlantingLocation[];
  selectedLocationId: number | null;
  onSelectLocation: (id: number | null) => void;
}

export function PlantingMapClient(props: PlantingMapClientProps) {
  return <PlantingMapInner {...props} />;
}
