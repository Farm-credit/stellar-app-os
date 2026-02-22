export default function Loading() {
  return (
    <div className="min-h-screen bg-stone-950 animate-pulse" aria-busy="true" aria-label="Loading project">
      {/* Hero skeleton */}
      <div className="h-[62vh] min-h-[480px] bg-stone-900" />
      <div className="h-1.5 bg-stone-800" />

      <div className="max-w-7xl mx-auto px-6 py-16 space-y-16">
        {/* Metric grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-stone-900 border border-stone-800" />
          ))}
        </div>
        {/* Content */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-12">
          <div className="space-y-4">
            <div className="h-8 w-56 rounded bg-stone-800" />
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-4 rounded bg-stone-900" style={{ width: `${75 + (i % 4) * 6}%` }} />
            ))}
          </div>
          <div className="space-y-4">
            <div className="h-48 rounded-2xl bg-stone-900 border border-stone-800" />
            <div className="h-36 rounded-2xl bg-stone-900 border border-stone-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
