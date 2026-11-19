'use client';

import { useCallback, useMemo, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/molecules/Card';
import { getSponsorProfile } from '@/lib/api/sponsors';
import { getSponsorPortfolio } from '@/lib/api/sponsor-portfolio';
import { buildImpactReportData } from '@/lib/impact-report/impact-report-data';

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sponsor';
}

export function ImpactReportsTab({ sponsorAddress }: { sponsorAddress: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const report = useMemo(() => {
    const profile = getSponsorProfile(sponsorAddress);
    if (!profile) return null;
    const portfolio = getSponsorPortfolio(profile.address, {
      totalTrees: profile.totalTrees,
      totalCo2OffsetTonnes: profile.co2Offset,
    });
    return buildImpactReportData({ name: profile.name, address: profile.address }, portfolio);
  }, [sponsorAddress]);

  const handleDownload = useCallback(async () => {
    if (!report) return;
    setIsGenerating(true);
    setError(null);
    try {
      // Loaded on demand so the PDF renderer stays out of the dashboard bundle.
      const [{ pdf }, { SponsorImpactReportPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./SponsorImpactReportPDF'),
      ]);
      const blob = await pdf(<SponsorImpactReportPDF data={report} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slugify(report.sponsorName)}-impact-report-${report.reportYear}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Impact report generation failed:', err);
      setError('We could not generate your report. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [report]);

  if (!report) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No sponsor data is available for this account yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-stellar-green" aria-hidden="true" />
          Annual impact report {report.reportYear}
        </CardTitle>
        <CardDescription>
          A personalised PDF for {report.sponsorName} summarising your total trees, CO₂ absorbed,
          species diversity and geographic spread.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Trees</dt>
            <dd className="text-xl font-bold">{report.totalTrees.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">CO₂ absorbed / year</dt>
            <dd className="text-xl font-bold">{report.totalCo2Tonnes.toFixed(1)} t</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Species</dt>
            <dd className="text-xl font-bold">{report.speciesCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Regions</dt>
            <dd className="text-xl font-bold">{report.regionCount}</dd>
          </div>
        </dl>
        <Button
          id="download-impact-report-btn"
          onClick={handleDownload}
          disabled={isGenerating}
          aria-label="Download annual impact report as PDF"
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          {isGenerating ? 'Generating report…' : 'Download PDF report'}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
