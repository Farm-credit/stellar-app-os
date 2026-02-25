/**
 * Blog page loading state — Next.js Suspense fallback
 *
 * Displays skeleton cards in the same grid layout as the real blog grid
 * while the server fetches data. Shows 12 skeleton cards to fill the viewport.
 *
 * Requirements: 1.5, 10.1
 */

function BlogCardSkeleton() {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card animate-pulse"
      aria-hidden="true"
    >
      {/* Image placeholder */}
      <div className="h-48 w-full bg-muted" />

      {/* Content placeholder */}
      <div className="flex flex-col gap-3 p-6">
        {/* Badge */}
        <div className="h-5 w-24 rounded-full bg-muted" />
        {/* Title */}
        <div className="h-6 w-full rounded bg-muted" />
        <div className="h-6 w-3/4 rounded bg-muted" />
        {/* Excerpt */}
        <div className="mt-1 h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
        <div className="h-4 w-4/6 rounded bg-muted" />
        {/* Meta */}
        <div className="mt-2 h-4 w-32 rounded bg-muted" />
      </div>
    </div>
  );
}

export default function BlogLoading() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12">
      {/* Page header skeleton */}
      <div className="mb-12 flex flex-col items-center gap-4" aria-hidden="true">
        <div className="h-10 w-64 rounded-lg bg-muted animate-pulse" />
        <div className="h-5 w-96 max-w-full rounded bg-muted animate-pulse" />
      </div>

      {/* Featured post hero skeleton */}
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

      {/* Category filter skeleton */}
      <div className="mb-8 flex gap-2" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-11 w-24 rounded-md bg-muted animate-pulse" />
        ))}
      </div>

      {/* Blog grid skeleton — 12 cards */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        role="status"
        aria-label="Loading blog posts"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <BlogCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
