export default function StewardPortfolioLoading() {
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8"
      role="status"
      aria-label="Loading steward portfolio"
    >
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="h-5 w-96 max-w-full animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-xl border bg-muted" />
        ))}
      </div>
    </main>
  );
}
