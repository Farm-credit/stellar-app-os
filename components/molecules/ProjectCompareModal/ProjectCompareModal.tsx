'use client';

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { Check, Link2, X } from 'lucide-react';

import { Button } from '@/components/atoms/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  COMPARE_METRICS,
  getBestProjectIds,
  type CompareMetric,
} from '@/lib/projectCompareSelection';
import type { TreeSponsorshipOffering } from '@/lib/treeSponsorshipComparison';

export interface ProjectCompareModalProps {
  offerings: readonly TreeSponsorshipOffering[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (projectId: string) => void;
  /** Absolute URL that reopens this exact comparison. */
  shareUrl: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

function renderCell(
  offering: TreeSponsorshipOffering,
  metric: CompareMetric,
  isBest: boolean
): JSX.Element {
  return (
    <td
      key={`${metric.id}-${offering.id}`}
      className={cn('p-3 text-sm', isBest && 'font-semibold text-stellar-green')}
      data-testid={`compare-cell-${metric.id}-${offering.id}`}
      data-best={isBest ? 'true' : undefined}
    >
      {metric.format(offering)}
      {isBest && <span className="sr-only"> (best)</span>}
    </td>
  );
}

export function ProjectCompareModal({
  offerings,
  open,
  onOpenChange,
  onRemove,
  shareUrl,
}: ProjectCompareModalProps): JSX.Element {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState('idle'), 2500);
  }, [shareUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        data-testid="project-compare-modal"
      >
        <DialogHeader>
          <DialogTitle>Compare reforestation projects</DialogTitle>
          <DialogDescription>
            Side-by-side view of up to three projects. The best value in each row is highlighted.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[480px] border-collapse text-left">
            <caption className="sr-only">Reforestation project comparison</caption>
            <thead className="bg-muted/60">
              <tr>
                <th scope="col" className="p-3 text-xs font-semibold text-muted-foreground">
                  Metric
                </th>
                {offerings.map((offering) => (
                  <th key={offering.id} scope="col" className="p-3 align-top">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold leading-tight">
                        {offering.projectName}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(offering.id)}
                        aria-label={`Remove ${offering.projectName} from comparison`}
                        className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-stellar-blue"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <span className="text-xs font-normal text-muted-foreground">
                      {offering.location}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {COMPARE_METRICS.map((metric) => {
                const bestIds = getBestProjectIds(offerings, metric);

                return (
                  <tr key={metric.id}>
                    <th scope="row" className="p-3 align-top">
                      <span className="block text-sm font-medium">{metric.label}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {metric.description}
                      </span>
                    </th>
                    {offerings.map((offering) =>
                      renderCell(offering, metric, bestIds.includes(offering.id))
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            readOnly
            value={shareUrl}
            aria-label="Shareable comparison link"
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border bg-muted/40 px-3 py-2 text-xs"
            data-testid="compare-share-url"
          />
          <Button type="button" variant="outline" onClick={handleCopy} className="shrink-0">
            {copyState === 'copied' ? (
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
            ) : (
              <Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {copyState === 'copied' ? 'Link copied' : 'Copy link'}
          </Button>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {copyState === 'copied' && 'Comparison link copied to clipboard'}
          {copyState === 'failed' && 'Could not copy the link. Select it and copy manually.'}
        </p>
      </DialogContent>
    </Dialog>
  );
}

ProjectCompareModal.displayName = 'ProjectCompareModal';

export default ProjectCompareModal;
