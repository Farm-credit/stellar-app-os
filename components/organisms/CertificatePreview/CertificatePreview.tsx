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

  const explorerUrl = getExplorerUrl(data.transactionHash, data.explorerBaseUrl);
  const displayName = getDisplayName(data);

  const formattedDate = data.retirementDate.toLocaleDateString('en-US', {
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
      await generateCertificatePdf({ qrDataUrl, data });
    } catch {
      setDownloadError('Failed to generate PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [qrDataUrl, data]);

  return (
    <Card
      className={cn('mx-auto w-full max-w-2xl overflow-hidden print:shadow-none', className)}
      role="region"
      aria-label="Retirement Certificate Preview"
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
            Verified
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
          RETIREMENT CERTIFICATE
        </Text>
        <Text variant="small" className="text-center text-white/70">
          Carbon Credit Retirement on the Stellar Network
        </Text>
        <Text variant="muted" className="text-white/50">
          Issued: {formattedDate}
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
            has permanently retired
          </Text>
          <div className="rounded-lg bg-muted px-8 py-4">
            <Text
              variant="h2"
              as="p"
              className="text-center font-bold"
              style={{ color: 'var(--stellar-navy)' }}
            >
              {data.quantityRetired.toLocaleString()} Carbon Credit
              {data.quantityRetired !== 1 ? 's' : ''}
            </Text>
          </div>
          <Text variant="body" className="text-muted-foreground">
            from the project
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
          {data.projectDescription && (
            <Text variant="muted" className="max-w-md text-center italic">
              {data.projectDescription}
            </Text>
          )}
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
            <CertificateField label="Retirement Date" value={formattedDate} />
            <CertificateField
              label="Quantity Retired"
              value={`${data.quantityRetired.toLocaleString()} tCO₂e`}
            />

            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ color: 'var(--stellar-blue)' }}
              aria-label="View transaction on Stellar explorer (opens in new tab)"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              View on Stellar Explorer
            </a>
          </div>

          {/* Right: QR */}
          <div className="flex flex-col items-center gap-2">
            <QrCode
              value={explorerUrl}
              size={140}
              onGenerated={handleQrGenerated}
              onError={handleQrError}
              aria-label="QR code linking to Stellar blockchain explorer"
            />
            {qrError && (
              <Text variant="muted" className="text-center text-xs text-destructive">
                QR code unavailable
              </Text>
            )}
            <Text variant="muted" className="text-center text-xs">
              Scan to verify on-chain
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
          Powered by Stellar Network · Immutable · Verifiable · Permanent
        </Text>

        <div className="flex flex-col items-center gap-1">
          <Button
            onClick={handleDownload}
            disabled={isGenerating}
            className="gap-2 print:hidden"
            aria-label="Download retirement certificate as PDF"
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
