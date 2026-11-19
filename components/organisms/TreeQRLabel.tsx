'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode as QrCodeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QrCode } from '@/components/atoms/QrCode';
import type { Tree } from '@/lib/types/tree';

function safeFilePart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '') || 'tree'
  );
}

/** A scannable public profile link with a print-ready 4 × 2.5 inch PDF label. */
export function TreeQRLabel({ tree }: { tree: Tree }) {
  const [profileUrl, setProfileUrl] = useState(`/trees/${encodeURIComponent(tree.id)}`);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfileUrl(
      new URL(`/trees/${encodeURIComponent(tree.id)}`, window.location.origin).toString()
    );
  }, [tree.id]);

  const downloadName = useMemo(() => `${safeFilePart(tree.treeId)}-qr-tag.pdf`, [tree.treeId]);

  const downloadLabel = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const [{ jsPDF }, qrPng] = await Promise.all([
        import('jspdf'),
        QRCode.toDataURL(profileUrl, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 600,
          color: { dark: '#102a1b', light: '#ffffff' },
        }),
      ]);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [101.6, 63.5] });
      pdf.setFillColor(250, 253, 249);
      pdf.roundedRect(2, 2, 97.6, 59.5, 2, 2, 'F');
      pdf.addImage(qrPng, 'PNG', 5, 8, 42, 42);
      pdf.setTextColor(20, 83, 45);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('FARMCREDIT  ·  TREE PROFILE', 52, 13);
      pdf.setTextColor(25, 39, 30);
      pdf.setFontSize(13);
      pdf.text(pdf.splitTextToSize(tree.species, 43), 52, 23);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Tree ID  ${tree.treeId}`, 52, 32);
      pdf.text(pdf.splitTextToSize(tree.region, 43), 52, 39);
      pdf.setTextColor(65, 89, 72);
      pdf.setFontSize(6);
      pdf.text('Scan to visit this tree’s public digital profile', 52, 48);
      pdf.text(pdf.splitTextToSize(profileUrl, 43), 52, 54);
      pdf.save(downloadName);
    } catch (cause) {
      console.error('Tree QR label generation failed:', cause);
      setError('The printable tag could not be generated. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section
      aria-labelledby="tree-qr-label-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-xl border bg-white p-2">
          <QrCode value={profileUrl} size={128} className="h-32 w-32" />
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <h2
              id="tree-qr-label-heading"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <QrCodeIcon className="h-5 w-5 text-stellar-green" aria-hidden="true" />
              Print a tree tag
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Attach this QR label to a stake so visitors can open this tree’s public profile—no
              account required.
            </p>
          </div>
          <p className="break-all font-mono text-xs text-muted-foreground">{profileUrl}</p>
          <Button
            onClick={downloadLabel}
            disabled={isGenerating}
            aria-label="Download printable tree QR tag as PDF"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {isGenerating ? 'Creating PDF…' : 'Download printable PDF tag'}
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
