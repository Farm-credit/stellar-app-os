import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Trees, SlidersHorizontal, Map as MapIcon } from 'lucide-react';
import { PlantingLocationsExplorer } from '@/components/organisms/PlantingMap/PlantingLocationsExplorer';
import { WaitlistZoneList } from '@/components/organisms/PlantingMap/WaitlistZoneList';

export const metadata: Metadata = {
  title: 'Planting Locations — Stellar Farm Credit',
  description:
    'Browse and filter interactive map of tree-planting locations worldwide. Sponsor trees in the region, climate, and species of your choice.',
};

export const dynamic = 'force-dynamic';

function LoadingSkeleton() {
  return (
    <div className="h-full w-full animate-pulse space-y-4">
      <div className="h-8 w-64 rounded bg-muted" />
      <div className="h-[60vh] w-full rounded-xl bg-muted" />
    </div>
  );
}

export default function PlantingLocationsPage() {
  return (
    <div className="min-h-[calc(100dvh-var(--header-height,0px))] bg-muted/30">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stellar-green">
                <Trees className="size-5 text-white" aria-hidden="true" />
              </div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Planting Locations</h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Explore our global network of verified tree-planting sites. Filter by region, climate,
              or species, then sponsor trees in the location that matters most to you.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <MapIcon className="size-4" aria-hidden="true" />
              <span>Click markers for details</span>
            </div>
            <span aria-hidden="true">·</span>
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Use filters to narrow results</span>
              <span className="sm:hidden">Filter</span>
            </div>
          </div>
        </header>

        <Suspense fallback={<LoadingSkeleton />}>
          <PlantingLocationsExplorer />
        </Suspense>

        <section className="mt-6" aria-labelledby="waitlist-heading">
          <div className="mb-3 space-y-1">
            <h2 id="waitlist-heading" className="text-lg font-semibold tracking-tight">
              Fully sponsored zones
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              These planting zones have reached capacity. Join the waitlist and we&apos;ll
              automatically assign you a tree when the next planting batch opens.
            </p>
          </div>
          <Suspense fallback={<LoadingSkeleton />}>
            <WaitlistZoneList />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
