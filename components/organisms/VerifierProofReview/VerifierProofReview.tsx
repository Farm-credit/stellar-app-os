'use client';

/**
 * VerifierProofReview organism  (issue #859)
 *
 * Full-featured side-by-side satellite baseline vs. planter photo comparison
 * interface for auditors / verifiers.
 *
 * Layout:
 *  - Left panel  : scrollable queue of pending evidence submissions
 *  - Right panel : detail view with photo comparison, GPS analysis, and
 *                  decision form (approve / needs_review / reject)
 *
 * Features:
 *  - Independent zoom (100 % – 400 %) and pan for each photo
 *  - Synchronized toggle between "Side-by-Side" and "Overlay" (slider)
 *    comparison modes
 *  - GPS deviation indicator with colour-coded severity
 *  - Keyboard-accessible decision radio group + notes textarea
 *  - Full ARIA landmark / label coverage
 *  - Responsive: stacked on mobile, two-column from md, three-column on xl
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Maximize2,
  RotateCcw,
  SplitSquareHorizontal,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationDecision = 'approved' | 'rejected' | 'needs_review' | null;

export interface PhotoEvidence {
  /** Unique evidence ID */
  id: string;
  /** Satellite baseline image URL */
  baseline_url: string;
  /** Planter-submitted photo URL */
  submitted_url: string;
  /** On-chain tree reference */
  tree_ref: string;
  /** Planter display name */
  planter_name: string;
  /** Planter Stellar address */
  planter_address: string;
  /** Submitted GPS latitude */
  submitted_lat: number;
  /** Submitted GPS longitude */
  submitted_lng: number;
  /** Expected GPS latitude (from registry) */
  expected_lat: number;
  /** Expected GPS longitude (from registry) */
  expected_lng: number;
  /** Distance in metres between submitted and expected GPS */
  gps_deviation_m: number;
  /** ISO timestamp of submission */
  submitted_at: string;
  /** Tree species name */
  species_name: string;
  /** Parent project name */
  project_name: string;
  /** Human-readable location label */
  location_label: string;
  /** Current decision state */
  current_decision: VerificationDecision;
}

export interface VerifierProofReviewProps {
  /** Queue of evidence submissions to display */
  queue: PhotoEvidence[];
  /** Called when the verifier submits a decision */
  onDecision?: (
    evidenceId: string,
    decision: Exclude<VerificationDecision, null>,
    notes: string
  ) => void;
  /** Whether a decision submission is in-flight */
  isSubmitting?: boolean;
  /** Additional CSS class applied to the outer wrapper */
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

type DeviationLevel = 'acceptable' | 'warning' | 'high';

function deviationLevel(metres: number): DeviationLevel {
  if (metres <= 50) return 'acceptable';
  if (metres <= 200) return 'warning';
  return 'high';
}

type ComparisonMode = 'side-by-side' | 'overlay';

// ─────────────────────────────────────────────────────────────────────────────
// ZoomableImage sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface ZoomableImageProps {
  src: string;
  alt: string;
  label: string;
  badgeVariant?: 'secondary' | 'accent' | 'success' | 'default';
  'data-testid'?: string;
}

function ZoomableImage({
  src,
  alt,
  label,
  badgeVariant = 'secondary',
  'data-testid': testId,
}: ZoomableImageProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 4)), []);
  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const next = Math.max(z - 0.25, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      setIsDragging(true);
      dragOrigin.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [zoom, pan]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPan({
        x: dragOrigin.current.panX + (e.clientX - dragOrigin.current.x),
        y: dragOrigin.current.panY + (e.clientY - dragOrigin.current.y),
      });
    },
    [isDragging]
  );

  const stopDrag = useCallback(() => setIsDragging(false), []);

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <Badge variant={badgeVariant}>{label}</Badge>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= 1}
            aria-label="Zoom out"
            className="rounded p-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue disabled:opacity-40"
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span
            aria-live="polite"
            aria-label={`Zoom level ${Math.round(zoom * 100)} percent`}
            className="w-9 text-center text-xs tabular-nums text-muted-foreground"
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= 4}
            aria-label="Zoom in"
            className="rounded p-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue disabled:opacity-40"
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            disabled={zoom === 1}
            aria-label="Reset zoom"
            className="rounded p-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <a
            href={src}
            download
            aria-label="Download image"
            className="rounded p-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Image viewport */}
      <div
        className="relative select-none overflow-hidden rounded-xl border border-border bg-muted/30"
        style={{ height: 300 }}
        role="img"
        aria-label={alt}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-transform duration-100',
            zoom > 1 && 'cursor-grab',
            isDragging && 'cursor-grabbing'
          )}
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'center center',
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OverlayComparison sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface OverlayComparisonProps {
  baselineUrl: string;
  submittedUrl: string;
  treeRef: string;
}

function OverlayComparison({ baselineUrl, submittedUrl, treeRef }: OverlayComparisonProps) {
  const [opacity, setOpacity] = useState(50);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-muted/30"
        style={{ height: 320 }}
        role="img"
        aria-label={`Overlay comparison for tree ${treeRef}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={baselineUrl}
          alt={`Satellite baseline for tree ${treeRef}`}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={submittedUrl}
          alt={`Planter submission overlay for tree ${treeRef}`}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: opacity / 100 }}
        />
        {/* Corner labels */}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          Baseline
        </span>
        <span
          className="absolute right-2 top-2 rounded bg-stellar-blue/80 px-2 py-0.5 text-xs text-white"
          style={{ opacity: Math.max(opacity / 100, 0.5) }}
        >
          Submission
        </span>
      </div>

      {/* Opacity slider */}
      <div className="flex items-center gap-3">
        <span className="min-w-[64px] text-xs text-muted-foreground">
          Baseline {100 - opacity}%
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setOpacity(Number(e.target.value))}
          aria-label="Submission overlay opacity"
          aria-valuetext={`Submission ${opacity}%, Baseline ${100 - opacity}%`}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-stellar-blue"
        />
        <span className="min-w-[72px] text-right text-xs text-muted-foreground">
          Submission {opacity}%
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GpsDeviationCard sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface GpsDeviationCardProps {
  deviationM: number;
  submittedLat: number;
  submittedLng: number;
  expectedLat: number;
  expectedLng: number;
}

function GpsDeviationCard({
  deviationM,
  submittedLat,
  submittedLng,
  expectedLat,
  expectedLng,
}: GpsDeviationCardProps) {
  const level = deviationLevel(deviationM);

  const colourClasses = {
    acceptable: 'border-stellar-green/40 bg-stellar-green/5',
    warning: 'border-yellow-500/40 bg-yellow-500/5',
    high: 'border-destructive/40 bg-destructive/5',
  }[level];

  const badgeVariant: 'success' | 'accent' | 'destructive' = {
    acceptable: 'success' as const,
    warning: 'accent' as const,
    high: 'destructive' as const,
  }[level];

  const badgeLabel = { acceptable: 'Acceptable', warning: 'Review', high: 'High Deviation' }[level];

  const Icon = level === 'acceptable' ? CheckCircle : level === 'warning' ? AlertTriangle : XCircle;

  const iconColour =
    level === 'acceptable'
      ? 'text-stellar-green'
      : level === 'warning'
        ? 'text-yellow-500'
        : 'text-destructive';

  return (
    <div
      role="status"
      aria-label={`GPS deviation: ${deviationM.toFixed(1)} metres`}
      className={cn('space-y-3 rounded-xl border p-4', colourClasses)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', iconColour)} aria-hidden="true" />
        <Text variant="small" as="span" className="font-semibold">
          GPS Deviation: {deviationM.toFixed(1)} m
        </Text>
        <Badge variant={badgeVariant} className="ml-auto">
          {badgeLabel}
        </Badge>
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <span className="font-medium text-foreground">Submitted: </span>
          {submittedLat.toFixed(6)}, {submittedLng.toFixed(6)}
        </div>
        <div>
          <span className="font-medium text-foreground">Expected: </span>
          {expectedLat.toFixed(6)}, {expectedLng.toFixed(6)}
        </div>
      </div>

      {level !== 'acceptable' && (
        <p className="text-xs text-muted-foreground">
          {level === 'warning'
            ? 'Deviation exceeds 50 m — confirm planter intended location before approving.'
            : 'Deviation exceeds 200 m — location mismatch is likely. Consider rejecting.'}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DecisionPanel sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface DecisionPanelProps {
  evidenceId: string;
  currentDecision: VerificationDecision;
  onDecision?: VerifierProofReviewProps['onDecision'];
  isSubmitting?: boolean;
}

function DecisionPanel({
  evidenceId,
  currentDecision,
  onDecision,
  isSubmitting,
}: DecisionPanelProps) {
  const [selected, setSelected] = useState<VerificationDecision>(currentDecision);
  const [notes, setNotes] = useState('');

  // Sync state if the parent swaps to a different evidence item
  useEffect(() => {
    setSelected(currentDecision);
    setNotes('');
  }, [evidenceId, currentDecision]);

  const isDecided = currentDecision !== null;

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!selected || !onDecision || isDecided) return;
      onDecision(evidenceId, selected as Exclude<VerificationDecision, null>, notes);
    },
    [evidenceId, selected, notes, onDecision, isDecided]
  );

  const options = [
    {
      value: 'approved' as const,
      label: 'Approve',
      Icon: CheckCircle,
      ringColour: 'focus-visible:ring-stellar-green',
      selectedClasses: 'border-stellar-green bg-stellar-green/10 text-stellar-green',
      idleClasses: 'border-stellar-green/40 hover:border-stellar-green/70',
    },
    {
      value: 'needs_review' as const,
      label: 'Needs Review',
      Icon: AlertTriangle,
      ringColour: 'focus-visible:ring-yellow-500',
      selectedClasses: 'border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
      idleClasses: 'border-yellow-500/40 hover:border-yellow-500/70',
    },
    {
      value: 'rejected' as const,
      label: 'Reject',
      Icon: XCircle,
      ringColour: 'focus-visible:ring-destructive',
      selectedClasses: 'border-destructive bg-destructive/10 text-destructive',
      idleClasses: 'border-destructive/40 hover:border-destructive/70',
    },
  ] as const;

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Verification decision form"
      className="space-y-4"
      data-testid="decision-form"
    >
      <fieldset disabled={isDecided || isSubmitting}>
        <legend className="mb-3 text-sm font-semibold">Verification Decision</legend>
        <div
          role="radiogroup"
          aria-label="Select verification decision"
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {options.map(({ value, label, Icon, ringColour, selectedClasses, idleClasses }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected === value}
              data-selected={selected === value}
              onClick={() => setSelected(value)}
              disabled={isDecided || isSubmitting}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                'focus-visible:outline-none focus-visible:ring-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                ringColour,
                selected === value ? selectedClasses : idleClasses
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`notes-${evidenceId}`} className="mb-1.5 block text-sm font-semibold">
          Auditor Notes{' '}
          {!isDecided && <span className="font-normal text-muted-foreground">(optional)</span>}
        </label>
        <textarea
          id={`notes-${evidenceId}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isDecided || isSubmitting}
          rows={3}
          placeholder="Notes are recorded in the immutable audit log and visible to the planter…"
          aria-describedby={`notes-hint-${evidenceId}`}
          className={cn(
            'w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        />
        <p id={`notes-hint-${evidenceId}`} className="mt-1 text-xs text-muted-foreground">
          Notes become part of the on-chain audit trail.
        </p>
      </div>

      {isDecided ? (
        <div
          className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm"
          role="status"
          aria-label={`Decision already recorded: ${currentDecision}`}
        >
          <CheckCircle className="h-4 w-4 shrink-0 text-stellar-green" aria-hidden="true" />
          Decision already recorded:{' '}
          <strong className="ml-1 capitalize">{currentDecision?.replace('_', ' ')}</strong>
        </div>
      ) : (
        <Button
          type="submit"
          stellar="primary"
          disabled={!selected || isSubmitting}
          aria-label="Submit verification decision"
          className="w-full sm:w-auto"
        >
          {isSubmitting ? 'Submitting…' : 'Submit Decision'}
        </Button>
      )}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QueueItem sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface QueueItemProps {
  evidence: PhotoEvidence;
  isSelected: boolean;
  onSelect: (id: string) => void;
  index: number;
}

function QueueItem({ evidence, isSelected, onSelect, index }: QueueItemProps) {
  const level = deviationLevel(evidence.gps_deviation_m);

  const decisionBadge: Record<
    Exclude<VerificationDecision, null>,
    { label: string; variant: 'success' | 'destructive' | 'accent' }
  > = {
    approved: { label: 'Approved', variant: 'success' },
    rejected: { label: 'Rejected', variant: 'destructive' },
    needs_review: { label: 'Review', variant: 'accent' },
  };

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(evidence.id)}
        aria-pressed={isSelected}
        aria-label={`Select evidence for tree ${evidence.tree_ref}, submitted by ${evidence.planter_name}`}
        className={cn(
          'w-full rounded-xl border p-3 text-left transition-all',
          isSelected
            ? 'border-stellar-blue bg-stellar-blue/5 ring-1 ring-stellar-blue/40'
            : 'border-border hover:border-stellar-blue/40 hover:bg-muted/30'
        )}
        data-testid={`queue-item-${evidence.id}`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-1">
          <span className="text-xs text-muted-foreground">#{index + 1}</span>
          <div className="flex items-center gap-1">
            {evidence.current_decision && (
              <Badge
                variant={decisionBadge[evidence.current_decision].variant}
                className="text-[10px] px-1.5 py-0"
              >
                {decisionBadge[evidence.current_decision].label}
              </Badge>
            )}
            {level === 'high' && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                GPS Alert
              </Badge>
            )}
            {level === 'warning' && !evidence.current_decision && (
              <Badge variant="accent" className="text-[10px] px-1.5 py-0">
                GPS Warn
              </Badge>
            )}
          </div>
        </div>
        <p className="font-medium text-sm">{evidence.tree_ref}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{evidence.species_name}</p>
        <p className="text-xs text-muted-foreground">{evidence.planter_name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDateShort(evidence.submitted_at)}
        </p>
      </button>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main organism
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VerifierProofReview
 *
 * Renders a split layout: a scrollable evidence queue on the left and a
 * detailed side-by-side (or overlay) photo comparison panel on the right.
 * Auditors use the decision form to approve, flag, or reject each submission.
 */
export function VerifierProofReview({
  queue,
  onDecision,
  isSubmitting = false,
  className,
}: VerifierProofReviewProps) {
  const [selectedId, setSelectedId] = useState<string>(() => queue[0]?.id ?? '');
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('side-by-side');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep selected ID valid if queue changes
  const resolvedId = queue.some((e) => e.id === selectedId) ? selectedId : (queue[0]?.id ?? '');
  const evidence = queue.find((e) => e.id === resolvedId) ?? null;

  // Queue navigation helpers
  const currentIndex = queue.findIndex((e) => e.id === resolvedId);
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < queue.length - 1;

  const goToPrev = useCallback(() => {
    if (canGoPrev) setSelectedId(queue[currentIndex - 1].id);
  }, [canGoPrev, currentIndex, queue]);

  const goToNext = useCallback(() => {
    if (canGoNext) setSelectedId(queue[currentIndex + 1].id);
  }, [canGoNext, currentIndex, queue]);

  // Fullscreen
  const handleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Queue stats
  const stats = {
    total: queue.length,
    pending: queue.filter((e) => e.current_decision === null).length,
    approved: queue.filter((e) => e.current_decision === 'approved').length,
    rejected: queue.filter((e) => e.current_decision === 'rejected').length,
    needsReview: queue.filter((e) => e.current_decision === 'needs_review').length,
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col gap-6',
        isFullscreen && 'fixed inset-0 z-50 overflow-auto bg-background p-4',
        className
      )}
      data-testid="verifier-proof-review"
    >
      {/* ── Stats bar ── */}
      <section
        aria-label="Queue summary statistics"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { label: 'Pending Review', value: stats.pending, colour: 'text-stellar-blue' },
          { label: 'Approved', value: stats.approved, colour: 'text-stellar-green' },
          { label: 'Needs Review', value: stats.needsReview, colour: 'text-yellow-500' },
          { label: 'Rejected', value: stats.rejected, colour: 'text-destructive' },
        ].map(({ label, value, colour }) => (
          <Card key={label}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardDescription className="text-xs">{label}</CardDescription>
              <CardTitle className={cn('text-2xl', colour)}>{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      {/* ── Main layout ── */}
      <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Queue sidebar */}
        <Card className="h-fit md:sticky md:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Evidence Queue</CardTitle>
            <CardDescription>
              {stats.total} submission{stats.total !== 1 ? 's' : ''} • {stats.pending} pending
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ul
              aria-label="Evidence submissions queue"
              className="max-h-[60vh] space-y-2 overflow-y-auto pr-1"
            >
              {queue.length === 0 ? (
                <li className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  No submissions in queue.
                </li>
              ) : (
                queue.map((item, i) => (
                  <QueueItem
                    key={item.id}
                    evidence={item}
                    isSelected={item.id === resolvedId}
                    onSelect={setSelectedId}
                    index={i}
                  />
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Detail panel */}
        {evidence ? (
          <div
            className="space-y-6"
            role="region"
            aria-label={`Proof review detail for tree ${evidence.tree_ref}`}
          >
            {/* Header card */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-xl">{evidence.tree_ref}</CardTitle>
                      {evidence.current_decision && (
                        <Badge
                          variant={
                            evidence.current_decision === 'approved'
                              ? 'success'
                              : evidence.current_decision === 'rejected'
                                ? 'destructive'
                                : 'accent'
                          }
                        >
                          {evidence.current_decision === 'approved'
                            ? 'Approved'
                            : evidence.current_decision === 'rejected'
                              ? 'Rejected'
                              : 'Needs Review'}
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      {evidence.species_name} · {evidence.project_name} · {evidence.location_label}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Prev / Next */}
                    <button
                      type="button"
                      onClick={goToPrev}
                      disabled={!canGoPrev}
                      aria-label="Previous evidence"
                      className="rounded-lg border border-border p-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {currentIndex + 1} / {queue.length}
                    </span>
                    <button
                      type="button"
                      onClick={goToNext}
                      disabled={!canGoNext}
                      aria-label="Next evidence"
                      className="rounded-lg border border-border p-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={handleFullscreen}
                      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                      className="rounded-lg border border-border p-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                    >
                      <Maximize2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Meta row */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Planter:{' '}
                    <span className="font-medium text-foreground">{evidence.planter_name}</span>
                  </span>
                  <span>
                    Address:{' '}
                    <span className="font-mono text-foreground" title={evidence.planter_address}>
                      {truncateAddress(evidence.planter_address)}
                    </span>
                  </span>
                  <time dateTime={evidence.submitted_at}>
                    Submitted: {formatDate(evidence.submitted_at)}
                  </time>
                </div>
              </CardHeader>
            </Card>

            {/* Photo comparison card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Photo Comparison</CardTitle>
                    <CardDescription>
                      Satellite baseline vs. planter-submitted evidence
                    </CardDescription>
                  </div>

                  {/* Mode toggle */}
                  <div
                    role="group"
                    aria-label="Comparison mode"
                    className="flex items-center gap-1 rounded-xl border border-border p-1 self-start sm:self-auto"
                  >
                    <button
                      type="button"
                      onClick={() => setComparisonMode('side-by-side')}
                      aria-pressed={comparisonMode === 'side-by-side'}
                      aria-label="Side by side mode"
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                        comparisonMode === 'side-by-side'
                          ? 'bg-stellar-blue text-white'
                          : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <SplitSquareHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                      Side by Side
                    </button>
                    <button
                      type="button"
                      onClick={() => setComparisonMode('overlay')}
                      aria-pressed={comparisonMode === 'overlay'}
                      aria-label="Overlay mode"
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                        comparisonMode === 'overlay'
                          ? 'bg-stellar-blue text-white'
                          : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                      Overlay
                    </button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {comparisonMode === 'side-by-side' ? (
                  <section
                    aria-label="Side by side photo comparison"
                    className="grid grid-cols-1 gap-4 md:grid-cols-2"
                  >
                    <ZoomableImage
                      src={evidence.baseline_url}
                      alt={`Satellite baseline image for tree ${evidence.tree_ref} at expected GPS location`}
                      label="Satellite Baseline"
                      badgeVariant="secondary"
                      data-testid="baseline-image"
                    />
                    <ZoomableImage
                      src={evidence.submitted_url}
                      alt={`Planter-submitted photo for tree ${evidence.tree_ref}`}
                      label="Planter Submission"
                      badgeVariant="accent"
                      data-testid="submitted-image"
                    />
                  </section>
                ) : (
                  <section aria-label="Overlay photo comparison">
                    <OverlayComparison
                      baselineUrl={evidence.baseline_url}
                      submittedUrl={evidence.submitted_url}
                      treeRef={evidence.tree_ref}
                    />
                  </section>
                )}
              </CardContent>
            </Card>

            {/* GPS analysis card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">GPS Analysis</CardTitle>
                <CardDescription>
                  Distance between planter submission coordinates and registered tree location
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GpsDeviationCard
                  deviationM={evidence.gps_deviation_m}
                  submittedLat={evidence.submitted_lat}
                  submittedLng={evidence.submitted_lng}
                  expectedLat={evidence.expected_lat}
                  expectedLng={evidence.expected_lng}
                />
              </CardContent>
            </Card>

            {/* Decision card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Auditor Decision</CardTitle>
                <CardDescription>
                  Decisions are recorded on-chain and trigger planter notifications.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DecisionPanel
                  evidenceId={evidence.id}
                  currentDecision={evidence.current_decision}
                  onDecision={onDecision}
                  isSubmitting={isSubmitting}
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="flex items-center justify-center p-12">
            <div className="text-center">
              <CardTitle className="mb-2">No Evidence Selected</CardTitle>
              <CardDescription>Select a submission from the queue to review it.</CardDescription>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

VerifierProofReview.displayName = 'VerifierProofReview';
