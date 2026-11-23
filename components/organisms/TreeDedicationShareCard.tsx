'use client';

import { useState } from 'react';
import { Check, Copy, Download, Heart, Share2 } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/molecules/Card';
import { buildDedicationCardImageUrl, normalizeDedication } from '@/lib/trees/dedication';

interface TreeDedicationShareCardProps {
  treeId: string;
  treeIdLabel: string;
  dedication: string;
}

export function TreeDedicationShareCard({
  treeId,
  treeIdLabel,
  dedication,
}: TreeDedicationShareCardProps) {
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const normalized = normalizeDedication(dedication);
  if (!normalized) return null;

  const imageUrl = buildDedicationCardImageUrl(treeId);
  const downloadFilename = `${treeIdLabel.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}-dedication-card.png`;

  const handleCopyLink = async () => {
    try {
      const absoluteUrl = new URL(imageUrl, window.location.origin).toString();
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setStatusMessage('Dedication card link copied to clipboard.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatusMessage('Unable to copy link. Please copy the image URL manually.');
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      await handleCopyLink();
      return;
    }
    try {
      const absoluteUrl = new URL(`/trees/${encodeURIComponent(treeId)}`, window.location.origin).toString();
      await navigator.share({
        title: `Tree Dedication — ${treeIdLabel}`,
        text: `"${normalized}"`,
        url: absoluteUrl,
      });
    } catch {
      // User cancelled share dialog
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Heart className="h-4 w-4 fill-rose-500 text-rose-500" aria-hidden="true" />
          Shareable dedication card
        </CardTitle>
        <CardDescription>
          Auto-generated dedication card image ready to download or share.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border bg-emerald-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={`Dedication card for tree ${treeIdLabel}: ${normalized}`}
            className="h-auto w-full object-cover"
            width={1200}
            height={630}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={imageUrl}
            download={downloadFilename}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-stellar-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stellar-green/90"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download PNG
          </a>
          <Button type="button" variant="outline" size="sm" onClick={handleCopyLink}>
            {copied ? (
              <Check className="mr-1.5 h-4 w-4 text-stellar-green" aria-hidden="true" />
            ) : (
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy image link'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleNativeShare}>
            <Share2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Share
          </Button>
        </div>

        {statusMessage ? (
          <p role="status" className="text-xs text-muted-foreground">
            {statusMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
