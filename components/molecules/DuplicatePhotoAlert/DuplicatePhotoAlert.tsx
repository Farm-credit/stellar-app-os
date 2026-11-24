'use client';

import { forwardRef, useEffect, type HTMLAttributes } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { useAnnouncer } from '@/components/ui/live-region';
import { cn } from '@/lib/utils';
import type { DuplicateFlagDetails } from '@/lib/image/client-phash';

export interface DuplicatePhotoAlertProps extends HTMLAttributes<HTMLDivElement> {
  flag: DuplicateFlagDetails;
  onReplacePhoto?: () => void;
  title?: string;
}

/**
 * Accessible user-facing notification rendered whenever perceptual hashing
 * (pHash) detects a duplicate, near-duplicate, or reused stock photo in the
 * planting proof upload pipeline.
 *
 * Conforms to WCAG 2.1 AAA Status Messages (4.1.3) via both an inline
 * `role="alert"` region and the global `useAnnouncer` screen-reader helper.
 */
export const DuplicatePhotoAlert = forwardRef<HTMLDivElement, DuplicatePhotoAlertProps>(
  (
    { flag, onReplacePhoto, title = 'Duplicate or Reused Photo Flagged', className, ...props },
    ref
  ) => {
    const announce = useAnnouncer('phash-duplicate-announcer', true);
    const similarityPct = Math.round(flag.similarityScore * 1000) / 10;

    useEffect(() => {
      announce(
        `${title}. This image matches an existing planting submission (${similarityPct}% visual similarity, Hamming distance ${flag.distance} of ${flag.threshold} bits). Please upload an original on-site photo.`
      );
    }, [announce, flag.distance, flag.hash, flag.threshold, similarityPct, title]);

    return (
      <div
        ref={ref}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="duplicate-photo-alert"
        className={cn(
          'rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-foreground shadow-xs',
          className
        )}
        {...props}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text as="p" className="text-sm font-semibold text-destructive">
                {title}
              </Text>
              <Badge variant="destructive">
                <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                {similarityPct}% match ({flag.distance} bits)
              </Badge>
            </div>

            <Text as="p" className="text-xs leading-relaxed text-muted-foreground">
              Automated perceptual hash verification (<code className="font-mono">{flag.hash}</code>
              ) detected that this photo visually matches a previously submitted image within the{' '}
              <strong>{flag.threshold}-bit</strong> threshold. Reused or stock photos cannot be
              accepted as new planting proofs.
            </Text>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-[11px] text-muted-foreground">
              <span>pHash: {flag.hash}</span>
              <span>
                Hamming: {flag.distance}/{flag.threshold} bits
              </span>
              {flag.duplicateId !== undefined && <span>Ref: #{String(flag.duplicateId)}</span>}
            </div>

            {onReplacePhoto && (
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onReplacePhoto}
                  aria-label="Choose a different original planting photo"
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                  Choose a different photo
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

DuplicatePhotoAlert.displayName = 'DuplicatePhotoAlert';
