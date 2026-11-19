import Link from 'next/link';

export const metadata = { title: 'Fund Allocation Audit Report | FarmCredit' };

export default function FundAllocationAuditReportPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl space-y-8 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <header className="space-y-3 border-b border-border pb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stellar-green">
            Independent assurance
          </p>
          <h1 className="text-3xl font-bold text-foreground">2026 Fund Allocation Audit Report</h1>
          <p className="text-muted-foreground">
            Issued June 30, 2026 · Reporting period: July 2025–June 2026
          </p>
        </header>
        <p className="leading-7 text-muted-foreground">
          An independent third-party review reconciled sponsor payment records to the published
          allocation categories. The review found that reported percentages were supported by
          payment and operational records, and that quarterly disclosures were maintained.
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-muted/50 p-4">
            <dt className="text-sm text-muted-foreground">Audit conclusion</dt>
            <dd className="mt-1 font-semibold text-stellar-green">Reasonable assurance</dd>
          </div>
          <div className="rounded-xl bg-muted/50 p-4">
            <dt className="text-sm text-muted-foreground">Next annual review</dt>
            <dd className="mt-1 font-semibold text-foreground">June 30, 2027</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          This public summary is linked from the transparency dashboard. Supporting evidence is
          retained in the platform compliance archive and is available to authorized auditors.
        </p>
        <Link
          href="/transparency"
          className="inline-flex font-semibold text-stellar-blue hover:underline"
        >
          ← Back to platform transparency
        </Link>
      </article>
    </main>
  );
}
