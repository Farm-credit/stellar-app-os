'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  CheckCircle,
  ShieldCheck,
  QrCode as QrIcon,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import { QrCode } from '@/components/atoms/QrCode';
import { calculateTreeCarbonMetrics } from '@/lib/carbon/tree-carbon-metrics';
import type { Tree } from '@/lib/types/tree';

interface CarbonOffsetCertificateCardProps {
  tree: Tree;
  className?: string;
}

export function CarbonOffsetCertificateCard({ tree, className }: CarbonOffsetCertificateCardProps) {
  const [origin, setOrigin] = useState<string>('');
  const [downloadingFormat, setDownloadingFormat] = useState<'pdf' | 'png' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const trackingUrl = useMemo(() => {
    const base = origin || 'https://app.farmcredit.io';
    return `${base}/trees/${tree.treeId || tree.id}`;
  }, [origin, tree.treeId, tree.id]);

  const carbonMetrics = useMemo(() => calculateTreeCarbonMetrics(tree), [tree]);

  const formattedPlantedAt = useMemo(() => {
    if (!tree.plantedAt) return 'Pending / Not yet planted';
    const d = new Date(tree.plantedAt);
    if (Number.isNaN(d.getTime())) return 'Pending / Not yet planted';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [tree.plantedAt]);

  const coordinatesStr = useMemo(() => {
    const lat = typeof tree.lat === 'number' ? tree.lat : 0;
    const lng = typeof tree.lng === 'number' ? tree.lng : 0;
    return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;
  }, [tree.lat, tree.lng]);

  const handleDownload = async (format: 'pdf' | 'png') => {
    setDownloadingFormat(format);
    setDownloadError(null);
    try {
      const url = `/api/certificates/${tree.id}?format=${format}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `certificate-${tree.treeId || tree.id}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      console.error('Certificate download error:', err);
      setDownloadError(err instanceof Error ? err.message : 'Download failed. Please try again.');
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <Card
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm dark:border-slate-800 ${className || ''}`}
      role="region"
      aria-label="Carbon Offset Certificate"
    >
      <CardHeader className="relative bg-[#0D0B21] px-6 py-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-stellar-cyan" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-widest text-stellar-cyan">
                On-Chain Verification
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Carbon Offset Certificate
            </h2>
            <Text variant="small" className="text-slate-300">
              Verified environmental impact record for tree {tree.treeId}
            </Text>
          </div>

          <Badge
            variant="outline"
            className="border-stellar-green bg-stellar-green/20 text-stellar-green font-semibold gap-1.5 py-1 px-3"
          >
            <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Verified Offset
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        {/* Core Metadata Grid */}
        <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-4 dark:bg-slate-900/60">
          <div>
            <Text variant="small" className="text-xs uppercase font-semibold text-muted-foreground">
              Species
            </Text>
            <p className="mt-1 text-sm font-bold text-foreground">{tree.species}</p>
          </div>
          <div>
            <Text variant="small" className="text-xs uppercase font-semibold text-muted-foreground">
              Planting Date
            </Text>
            <p className="mt-1 text-sm font-bold text-foreground">{formattedPlantedAt}</p>
          </div>
          <div>
            <Text variant="small" className="text-xs uppercase font-semibold text-muted-foreground">
              Location
            </Text>
            <p className="mt-1 text-sm font-bold text-foreground truncate" title={tree.region}>
              {tree.region}
            </p>
            <p className="text-[11px] text-muted-foreground">{coordinatesStr}</p>
          </div>
          <div>
            <Text variant="small" className="text-xs uppercase font-semibold text-muted-foreground">
              Sponsor
            </Text>
            <p
              className="mt-1 text-sm font-bold text-stellar-green truncate"
              title={tree.sponsorName}
            >
              {tree.sponsorName || 'FarmCredit Community'}
            </p>
          </div>
        </div>

        {/* Estimated CO2 Sequestration Over Time */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Estimated CO₂ Sequestration Over Time ({carbonMetrics.methodology})
            </h3>
          </div>

          {carbonMetrics.hasMissingFormula ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              Methodology parameters missing for species &quot;{tree.species}&quot;. Specific
              sequestration figures are not invented.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-semibold text-stellar-blue uppercase">Annual Rate</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {carbonMetrics.annualRateKg} kg
                </p>
                <p className="text-[11px] text-muted-foreground">kg CO₂ / year (Next 12 mo)</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-semibold text-stellar-blue uppercase">Stored to Date</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {carbonMetrics.storedToDateKg} kg
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Cumulative (Age: {carbonMetrics.currentAgeYears} yrs)
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-semibold text-stellar-blue uppercase">10-Year Horizon</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {carbonMetrics.at10YearsKg} kg
                </p>
                <p className="text-[11px] text-muted-foreground">Cumulative 10-year period</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-semibold text-stellar-blue uppercase">At Maturity</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {carbonMetrics.atMaturityTonnes} t
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {carbonMetrics.atMaturityKg} kg ({carbonMetrics.maturityYears}-yr period)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* QR Verification Row */}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900/30">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg border bg-white p-1.5 shadow-2xs dark:border-slate-700">
            <QrCode value={trackingUrl} size={100} className="h-24 w-24" />
          </div>

          <div className="flex-1 text-center sm:text-left space-y-1">
            <p className="flex items-center justify-center sm:justify-start gap-1.5 text-sm font-bold text-foreground">
              <QrIcon className="h-4 w-4 text-stellar-green" aria-hidden="true" />
              Scannable QR Code Included in Both Formats
            </p>
            <p className="text-xs text-muted-foreground">
              Scanning the QR code opens this tree&apos;s live tracking page and audit trail.
            </p>
            <p className="break-all font-mono text-xs text-stellar-blue">{trackingUrl}</p>
          </div>
        </div>

        {/* Download Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="text-xs text-muted-foreground">
            Download your verifiable offset certificate in high-resolution PDF or shareable image.
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => handleDownload('pdf')}
              disabled={downloadingFormat !== null}
              className="gap-2 bg-stellar-navy hover:bg-slate-800 text-white"
              aria-label={`Download PDF - carbon offset certificate for tree ${tree.treeId}`}
            >
              {downloadingFormat === 'pdf' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Generating PDF…
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Download PDF
                </>
              )}
            </Button>

            <Button
              onClick={() => handleDownload('png')}
              disabled={downloadingFormat !== null}
              variant="outline"
              className="gap-2 border-stellar-blue/40 text-stellar-blue hover:bg-stellar-blue/10"
              aria-label={`Download Image - carbon offset certificate for tree ${tree.treeId}`}
            >
              {downloadingFormat === 'png' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Generating Image…
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  Download Image
                </>
              )}
            </Button>
          </div>
        </div>

        {downloadError && (
          <p role="alert" className="text-xs text-destructive">
            {downloadError}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
