'use client';

import dynamic from 'next/dynamic';
import type { JSX } from 'react';

const DynamicImpactMap = dynamic(
  () => import('@/components/organisms/ImpactMap/ImpactMap').then((m) => m.ImpactMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-muted" /> }
);

export function ImpactMapWrapper(props: any): JSX.Element {
  return <DynamicImpactMap {...props} />;
}
