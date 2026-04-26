'use client';

import { useCallback, useState } from 'react';
import { ExternalLink, Download, Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/molecules/Card';
import { CertificateField } from '@/components/molecules/CertificateField';
import { QrCode } from '@/components/atoms/QrCode';
import {
  type CertificateData,
  generateCertificatePdf,
  getDisplayName,
  getExplorerUrl,
} from '@/lib/certificate';

interface CertificatePreviewProps {
  data: CertificateData;
  className?: string;
}

function CertificatePreview({ data, className }: CertificatePreviewProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(data.isAnonymous || false);

  const explorerUrl = getExplorerUrl(data.transactionHash, data.explorerBaseUrl);
  const currentData = { ...data, isAnonymous };
  const displayName = getDisplayName(currentData);

  const formattedDate = data.retirementDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const formattedPlantingDate = data.plantingDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleQrGenerated = useCallback((dataUrl: string) => {
    setQrDataUrl(dataUrl);
    setQrError(false);
  }, []);

  const handleQrError = useCallback(() => {
    setQrError(true);
  }, []);

  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setDownloadError(null);

    try {
      await generateCertificatePdf({ qrDataUrl, data: currentData });
    } catch {
      setDownloadError('Failed to generate PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [qrDataUrl, currentData]);

  return (
    <Card
      className={cn('mx-auto w-full max-w-2xl overflow-hidden print:shadow-none', className)}
      role="region"
      aria-label="Impact Certificate Preview"
    >
      {/* ── Header ── */}
      <CardHeader
        className="relative flex flex-col items-center gap-2 pb-8 pt-10"
        style={{ background: 'var(--stellar-navy)' }}
      >
        {/* Verified badge */}
        <div className="absolute right-4 top-4">
          <Badge variant="success" className="gap-1 text-xs">
            <CheckCircle className="h-3 w-3" aria-hidden="true" />
            Verified Impact
          </Badge>
        </div>

        {/* Blue accent line at bottom of header */}
        <div
          className="absolute bottom-0 left-0 h-1 w-full"
          style={{ background: 'var(--stellar-blue)' }}
          aria-hidden="true"
        />

        <Text
          variant="h2"
          as="h1"
          className="text-center text-2xl font-bold tracking-widest text-white sm:text-3xl"
        >
          IMPACT CERTIFICATE
        </Text>
        <Text variant="small" className="text-center text-white/70">
          Environmental Restoration Verified on Stellar
        </Text>
        <Text variant="muted" className="text-white/50">
          Certificate ID: {data.transactionHash.slice(0, 12)}...
        </Text>
      </CardHeader>

      {/* ── Body ── */}
      <CardContent className="flex flex-col gap-6 px-6 py-8 sm:px-10">
        {/* Certification statement */}
        <div className="flex flex-col items-center gap-2 text-center">
          <Text variant="body" className="text-muted-foreground">
            This certifies that
          </Text>
          <Text
            variant="h3"
            as="h2"
            className="break-all text-center"
            style={{ color: 'var(--stellar-blue)' }}
            title={displayName}
          >
            {displayName}
          </Text>
          <Text variant="body" className="text-muted-foreground">
            has successfully contributed to
          </Text>
          
          <div className="grid grid-cols-2 gap-4 w-full max-w-md my-2">
            <div className="rounded-lg bg-muted p-4 flex flex-col items-center">
              <Text
                variant="h3"
                as="p"
                className="font-bold"
                style={{ color: 'var(--stellar-navy)' }}
              >
                {data.treeCount.toLocaleString()}
              </Text>
              <Text variant="small" className="text-muted-foreground">Trees Planted</Text>
            </div>
            <div className="rounded-lg bg-muted p-4 flex flex-col items-center">
              <Text
                variant="h3"
                as="p"
                className="font-bold"
                style={{ color: 'var(--stellar-navy)' }}
              >
                {data.co2Offset.toLocaleString()} t
              </Text>
              <Text variant="small" className="text-muted-foreground">CO2 Offset</Text>
            </div>
          </div>

          <Text variant="body" className="text-muted-foreground">
            Project:
          </Text>
          <Text
            variant="h4"
            as="h3"
            className="break-words text-center"
            style={{ color: 'var(--stellar-blue)' }}
            title={data.projectName}
          >
            {data.projectName}
          </Text>
          
          <div className="flex gap-4 text-sm mt-1">
            <Badge variant="outline" className="border-stellar-blue/30 text-stellar-blue">
              {data.region}
            </Badge>
            <Badge variant="outline" className="border-stellar-blue/30 text-stellar-blue">
              Planted {formattedPlantingDate}
            </Badge>
          </div>
        </div>

        {/* Divider */}
        <div
          className="h-px w-full"
          style={{ background: 'var(--stellar-blue)' }}
          aria-hidden="true"
        />

        {/* Transaction details + QR */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
          {/* Left: fields */}
          <div className="flex flex-1 flex-col gap-4">
            <CertificateField label="Transaction Hash" value={data.transactionHash} mono />
            <CertificateField label="Verification Date" value={formattedDate} />
            <div className="flex items-center gap-2 mt-2">
              <input 
                type="checkbox" 
                id="anonymous-toggle" 
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-stellar-blue focus:ring-stellar-blue"
              />
              <label htmlFor="anonymous-toggle" className="text-sm text-muted-foreground cursor-pointer">
                Anonymous Certificate
              </label>
            </div>

            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-2"
              style={{ color: 'var(--stellar-blue)' }}
              aria-label="View verification on Stellar explorer (opens in new tab)"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Verify on-chain
            </a>
          </div>

          {/* Right: QR */}
          <div className="flex flex-col items-center gap-2">
            <QrCode
              value={explorerUrl}
              size={120}
              onGenerated={handleQrGenerated}
              onError={handleQrError}
              aria-label="QR code linking to Stellar blockchain explorer"
            />
            <Text variant="muted" className="text-center text-[10px]">
              Scan to verify impact authenticity
            </Text>
          </div>
        </div>
      </CardContent>

      {/* ── Footer ── */}
      <CardFooter
        className="flex flex-col items-center gap-3 px-6 py-6 sm:flex-row sm:justify-between"
        style={{ background: 'var(--stellar-navy)' }}
      >
        <Text variant="small" className="text-center text-white/60 sm:text-left">
          Powered by Stellar · Verifiable Environmental Restoration
        </Text>

        <div className="flex flex-col items-center gap-1">
          <Button
            onClick={handleDownload}
            disabled={isGenerating}
            className="gap-2 print:hidden bg-stellar-blue hover:bg-stellar-blue/90"
            aria-label="Download impact certificate as PDF"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Generating…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden="true" />
                Download PDF
              </>
            )}
          </Button>

          {downloadError && (
            <Text variant="muted" className="text-center text-xs text-destructive">
              {downloadError}
            </Text>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

export { CertificatePreview };
export type { CertificatePreviewProps };
