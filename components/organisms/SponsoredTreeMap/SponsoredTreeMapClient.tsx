'use client';

import dynamic from 'next/dynamic';

const SponsoredTreeMapInner = dynamic(
  () =>
    import('@/components/organisms/SponsoredTreeMap/SponsoredTreeMap').then(
      (module) => module.SponsoredTreeMap
    ),
  {
    ssr: false,
    loading: () => <div className="h-[520px] w-full animate-pulse rounded-3xl bg-muted" />,
  }
);

export function SponsoredTreeMapClient() {
  return <SponsoredTreeMapInner />;
}
