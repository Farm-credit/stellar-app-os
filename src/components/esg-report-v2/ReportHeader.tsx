'use client';

import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';

interface ReportHeaderProps {
  report: BuyerComplianceReport;
}

export function ReportHeader({ report }: ReportHeaderProps) {
  const generatedDate = new Date(report.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="border-b border-border bg-card px-6 py-8 sm:px-8">
      <div className="max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stellar-blue">
          ESG Compliance Report
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {report.companyName}
        </h1>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Report ID</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">{report.reportId}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Period</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{report.period.label}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Generated</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{generatedDate}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Buyer ID</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">{report.buyerId}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
