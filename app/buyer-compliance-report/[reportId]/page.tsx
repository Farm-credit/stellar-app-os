'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';
import { ReportHeader } from '@/src/components/esg-report-v2/ReportHeader';
import { CarbonOffsetsSection } from '@/src/components/esg-report-v2/CarbonOffsetsSection';
import { CoBenefitsSection } from '@/src/components/esg-report-v2/CoBenefitsSection';
import { SupplyChainSection } from '@/src/components/esg-report-v2/SupplyChainSection';
import { ExportButtons } from '@/src/components/esg-report-v2/ExportButtons';

interface PageProps {
  params: Promise<{ reportId: string }>;
}

function ReportContent({ reportId }: { reportId: string }) {
  const searchParams = useSearchParams();
  const [report, setReport] = useState<BuyerComplianceReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadReport = async () => {
      try {
        const buyerId = searchParams.get('buyerId');
        const companyName = searchParams.get('company');

        if (!buyerId) {
          setError('Missing buyer ID. Please go back and generate a report first.');
          setIsLoading(false);
          return;
        }

        // For now, fetch the cached report or generate it fresh
        // In a real implementation, we'd retrieve from cache by reportId
        // This is a simplified flow that regenerates on page load
        const params = new URLSearchParams({ buyerId });
        const response = await fetch(`/api/v2/buyer-esg-report?${params.toString()}`);

        if (!response.ok) {
          throw new Error('Failed to load report');
        }

        const data = (await response.json()) as { report: BuyerComplianceReport };
        setReport(data.report);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setIsLoading(false);
      }
    };

    loadReport();
  }, [reportId, searchParams]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-border border-t-stellar-blue"></div>
          <p className="text-sm text-muted-foreground">Loading your ESG compliance report...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/buyer-compliance-report"
            className="inline-flex items-center gap-2 text-sm text-stellar-blue hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Generate Report
          </Link>
          <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
            <h2 className="font-semibold">Unable to Load Report</h2>
            <p className="mt-2 text-sm">{error || 'Report not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header Navigation */}
      <div className="border-b border-border bg-card px-6 py-4 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/buyer-compliance-report"
            className="inline-flex items-center gap-2 text-sm text-stellar-blue hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Generate New Report
          </Link>
        </div>
      </div>

      {/* Report */}
      <ReportHeader report={report} />

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-8">
        {/* Export Buttons */}
        <div className="mb-12">
          <ExportButtons report={report} />
        </div>

        {/* Sections */}
        <div className="space-y-16">
          <CarbonOffsetsSection report={report} />
          <CoBenefitsSection report={report} />
          <SupplyChainSection report={report} />
        </div>

        {/* Disclaimers */}
        <div className="mt-16 border-t border-border pt-12">
          <h2 className="text-lg font-bold text-foreground">Disclaimers</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {report.disclaimers.map((disclaimer, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="text-stellar-blue">•</span>
                <span>{disclaimer}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="mt-12 border-t border-border pt-8 text-center text-xs text-muted-foreground">
          <p>ESG Compliance Report • Harvesta Carbon Management System</p>
        </div>
      </div>
    </main>
  );
}

export default async function BuyerComplianceReportDetailPage({ params }: PageProps) {
  const { reportId } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <p className="text-muted-foreground">Loading report...</p>
        </div>
      }
    >
      <ReportContent reportId={reportId} />
    </Suspense>
  );
}
