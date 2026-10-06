'use client';

import dynamic from 'next/dynamic';
import type { JSX, ComponentProps } from 'react';
import type { OffsetProjectMap } from './OffsetProjectMap';

const DynamicMap = dynamic(
  () => import('./OffsetProjectMap').then((m) => m.OffsetProjectMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[620px] rounded-2xl bg-muted/30 animate-pulse border border-border/60 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-sm font-medium text-muted-foreground">Loading interactive global project map...</span>
      </div>
    ),
  }
);

export function OffsetProjectMapWrapper(
  props: ComponentProps<typeof OffsetProjectMap>
): JSX.Element {
  return <DynamicMap {...props} />;
}
