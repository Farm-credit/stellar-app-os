'use client';

import { useState } from 'react';
import { Link2, Check, Copy } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { useToast } from '@/hooks/useToast';

interface AffiliateLinkCardProps {
  referralLink: string;
}

/**
 * Copy-to-clipboard card for a partner's tracked affiliate link. Mirrors the
 * existing ReferralLinkCard but with the partnership-branded styling used on
 * the affiliate page.
 */
export function AffiliateLinkCard({ referralLink }: AffiliateLinkCardProps) {
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      addToast('Affiliate link copied!', 'success', 2000);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Failed to copy link. Please try again.', 'error', 2000);
    }
  };

  return (
    <div className="rounded-2xl border border-stellar-blue/20 bg-card p-5">
      <label
        htmlFor="affiliate-link"
        className="mb-2 flex items-center gap-2 text-sm font-semibold"
      >
        <Link2 className="h-4 w-4 text-stellar-blue" aria-hidden />
        Your affiliate link
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="affiliate-link"
          type="text"
          readOnly
          value={referralLink}
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="button"
          stellar={copied ? 'success' : 'primary'}
          onClick={handleCopy}
          className="shrink-0 gap-2"
          aria-live="polite"
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>
      <Text variant="small" className="mt-2 text-muted-foreground">
        Anyone who signs up as a sponsor through this link earns you a commission on their
        contributions.
      </Text>
    </div>
  );
}
