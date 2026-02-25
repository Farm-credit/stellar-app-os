'use client';

/**
 * loading.tsx must be 'use client' to access the translation hook
 * for the accessible aria-label on the loading grid.
 */

import { useAppTranslation } from '@/hooks/useTranslation';
import { JSX } from 'react';

function BlogCardSkeleton(): JSX.Element {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card animate-pulse"
      aria-hidden="true"
    >
      <div className="h-48 w-full bg-muted" />
      <div className="flex flex-col gap-3 p-6">
        <div className="h-5 w-24 rounded-full bg-muted" />
        <div className="h-6 w-full rounded bg-muted" />
        <div className="h-6 w-3/4 rounded bg-muted" />
        <div className="mt-1 h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
        <div className="h-4 w-4/6 rounded bg-muted" />
        <div className="mt-2 h-4 w-32 rounded bg-muted" />
      </div>
    </div>
  );
}

export default function BlogLoading(): JSX.Element {
  const { t } = useAppTranslation();

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12 flex flex-col items-center gap-4" aria-hidden="true">
        <div className="h-10 w-64 rounded-lg bg-muted animate-pulse" />
        <div className="h-5 w-96 max-w-full rounded bg-muted animate-pulse" />
      </div>

      <div
        className="mb-12 overflow-hidden rounded-xl border border-border bg-card animate-pulse"
        aria-hidden="true"
      >
        <div className="flex flex-col md:flex-row">
          <div className="h-64 md:h-80 md:w-1/2 bg-muted" />
          <div className="flex flex-col gap-4 p-8 md:w-1/2">
            <div className="h-5 w-28 rounded-full bg-muted" />
            <div className="h-8 w-full rounded bg-muted" />
            <div className="h-8 w-4/5 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
            <div className="h-4 w-4/6 rounded bg-muted" />
            <div className="mt-4 h-4 w-36 rounded bg-muted" />
          </div>
        </div>
      </div>

      <div className="mb-8 flex gap-2" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-11 w-24 rounded-md bg-muted animate-pulse" />
        ))}
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        role="status"
        aria-label={t('blog.loadingAriaLabel')}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <BlogCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}