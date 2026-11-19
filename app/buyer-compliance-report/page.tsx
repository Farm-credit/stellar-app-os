'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BuyerReportForm, type BuyerReportFormData } from '@/src/components/esg-report-v2/BuyerReportForm';

export default function BuyerComplianceReportPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: BuyerReportFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      // Query the API to generate the report
      const params = new URLSearchParams({
        buyerId: data.buyerId,
        from: data.startDate,
        to: data.endDate,
        interval: data.periodType === 'month' ? 'month' : 'quarter',
      });

      const response = await fetch(`/api/v2/buyer-esg-report?${params.toString()}`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || `API error: ${response.statusText}`);
      }

      const result = (await response.json()) as { report: { reportId: string } };
      const { report } = result;

      // Redirect to report detail page
      router.push(`/buyer-compliance-report/${report.reportId}?buyerId=${encodeURIComponent(data.buyerId)}&company=${encodeURIComponent(data.companyName)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-6 py-12 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stellar-blue">
            ESG Compliance Reporting
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Generate Your Report
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
            Create an ESG compliance report from your carbon offset purchases. View your offset
            history, co-benefits achieved, and supply chain impact.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Form Section */}
          <div>
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-bold text-foreground">Report Details</h2>
              <BuyerReportForm onSubmit={handleSubmit} isLoading={isLoading} />
              {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
              <h3 className="font-semibold text-foreground">About This Report</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>✓ Real purchase data from your account</li>
                <li>✓ Carbon offset aggregation by project</li>
                <li>✓ Co-benefits from verified projects</li>
                <li>✓ Supply chain transparency</li>
                <li>✓ PDF and Excel export formats</li>
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                This report shows sustainability data from your verified carbon offset
                purchases. No compliance standard has been validated for this report.
              </p>
            </div>
          </div>

          {/* Help & Links */}
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-bold text-foreground">What's Included</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="font-semibold text-foreground">Carbon Offset Purchases</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    View all carbon credits purchased during your selected period, including
                    project names, tonnes, costs, and verification status.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Co-Benefits Achieved</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Beyond carbon reduction, see the additional social and environmental impact
                    of your purchases: biodiversity, community impact, and more.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Supply Chain Impact</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Track each project's lifecycle from origination through verification,
                    issuance, purchase, and retirement.
                  </p>
                </div>
              </div>
            </div>

            {/* Related Links */}
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-bold text-foreground">Related Resources</h2>
              <div className="mt-4 space-y-2">
                <Link
                  href="/esg-disclosure"
                  className="block rounded px-3 py-2 text-sm text-stellar-blue hover:bg-muted"
                >
                  → ESG Disclosure Tool (v1)
                </Link>
                <Link
                  href="/"
                  className="block rounded px-3 py-2 text-sm text-stellar-blue hover:bg-muted"
                >
                  → Back to Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
