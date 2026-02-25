function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6" aria-hidden="true">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="mt-4 h-10 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border p-4" aria-hidden="true">
      <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
    </li>
  );
}

export default function AdminDashboardLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-3" aria-hidden="true">
        <div className="h-9 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-[28rem] max-w-full animate-pulse rounded bg-muted" />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <MetricCardSkeleton key={index} />
        ))}
      </div>

      <div className="mb-8 rounded-xl border border-border bg-card p-6" role="status" aria-label="Loading trend chart">
        <div className="mb-5 h-5 w-40 animate-pulse rounded bg-muted" aria-hidden="true" />
        <div className="h-[260px] animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      </div>

      <div className="rounded-xl border border-border bg-card p-6" role="status" aria-label="Loading recent activity">
        <div className="mb-5 h-5 w-44 animate-pulse rounded bg-muted" aria-hidden="true" />
        <ul className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <ActivitySkeleton key={index} />
          ))}
        </ul>
      </div>
    </main>
  );
}
