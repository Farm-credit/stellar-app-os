'use client';

import { useState } from 'react';
import { Copy, Facebook, Linkedin, Share2 } from 'lucide-react';

interface ShareButtonsProps {
  title: string;
  url: string;
}

function openSharePopup(shareUrl: string) {
  window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=500');
}

export function ShareButtons({ title, url }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const canUseNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const handleNativeShare = async () => {
    if (!canUseNativeShare) return;
    await navigator.share({ title, url });
  };

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section aria-label="Share this post" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">Share</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {canUseNativeShare && (
          <button
            type="button"
            onClick={handleNativeShare}
            className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Share this post using your device sharing options"
          >
            Share
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            openSharePopup(
              `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`
            )
          }
          className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Share this post on X"
        >
          X
        </button>

        <button
          type="button"
          onClick={() =>
            openSharePopup(
              `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
            )
          }
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Share this post on Facebook"
        >
          <Facebook className="h-4 w-4" aria-hidden="true" />
          Facebook
        </button>

        <button
          type="button"
          onClick={() =>
            openSharePopup(
              `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
            )
          }
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Share this post on LinkedIn"
        >
          <Linkedin className="h-4 w-4" aria-hidden="true" />
          LinkedIn
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Copy this post link"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </section>
  );
}
