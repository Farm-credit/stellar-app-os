'use client';

import dynamic from 'next/dynamic';

const TreeClusterMapInner = dynamic(
  () =>
    import('@/components/organisms/TreeClusterMap/TreeClusterMap').then(
      (module) => module.TreeClusterMap
    ),
  {
    ssr: false,
    loading: () => <div className="h-[520px] w-full animate-pulse rounded-3xl bg-muted" />,
  }
);

export function TreeClusterMapClient() {
  return <TreeClusterMapInner />;
}
