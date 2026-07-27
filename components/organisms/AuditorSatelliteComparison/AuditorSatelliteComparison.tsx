'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Download, CheckCircle, XCircle, AlertTriangle, Maximize2 } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VerificationDecision = 'approved' | 'rejected' | 'needs_review' | null;

export interface PhotoEvidence {
  /** Unique identifier for this evidence submission */
  id: string;
  /** URL of the satellite baseline photo */
  baseline_url: string;
  /** URL of the planter-submitted photo */
  submitted_url: string;
  /** Tree reference (on-chain ID) */
  tree_ref: string;
  /** Planter's display name */
  planter_name: string;
  /** Planter's Stellar address */
  planter_address: string;
  /** GPS coordinates when photo was submitted */
  submitted_lat: number;
  submitted_lng: number;
  /** Expected GPS coordinates (from tree registry) */
  expected_lat: number;
  expected_lng: number;
  /** Distance in metres between submitted and expected GPS */
  gps_deviation_m: number;
  /** ISO timestamp of submission */
  submitted_at: string;
  /** Species of the tree */
  species_name: string;
  /** Current verification decision (if any) */
  current_decision: VerificationDecision;
}

export interface AuditorSatelliteComparisonProps {
  /** The evidence to review */
  evidence: PhotoEvidence;
  /** Called when the auditor submits a decision. */
  onDecision?: (evidenceId: string, decision: VerificationDecision, notes: string) => void;
  /** Whether the form is in a submitting/loading state */
  isSubmitting?: boolean;
  /** Additional CSS class */
  className?: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ZoomableImageProps {
  src: string;
  alt: string;
  label: string;
  labelVariant?: 'default' | 'secondary' | 'accent' | 'success';
}

function ZoomableImage({ src, alt, label, labelVariant = 'secondary' }: ZoomableImageProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 4)), []);
  const handleZoomOut = useCallback(
    () =>
      setZoom((z) => {
        const next = Math.max(z - 0.25, 1);
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      }),
    []
  );
  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [zoom, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPan({
        x: dragStart.current.panX + (e.clientX - dragStart.current.x),
        y: dragStart.current.panY + (e.clientY - dragStart.current.y),
      });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  return (
    <div className="flex flex-col gap-2">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <Badge variant={labelVariant}>{label}</Badge>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            aria-label="Zoom out"
            className="p-1 rounded hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs tabular-nums text-muted-foreground w-9 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 4}
            aria-label="Zoom in"
            className="p-1 rounded hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={zoom === 1}
            aria-label="Reset zoom"
            className="p-1 rounded hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <a
            href={src}
            download
            aria-label="Download image"
            className="p-1 rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue transition-colors"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Image container */}
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-muted/30 select-none"
        style={{ height: '280px' }}
        role="img"
        aria-label={alt}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-transform duration-100',
            zoom > 1 && 'cursor-grab',
            isDragging && 'cursor-grabbing'
          )}
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'center center',
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}

// ── GPS deviation indicator ───────────────────────────────────────────────────

interface GpsDeviationProps {
  deviationM: number;
  submittedLat: number;
  submittedLng: number;
  expectedLat: number;
  expectedLng: number;
}

function GpsDeviation({
  deviationM,
  submittedLat,
  submittedLng,
  expectedLat,
  expectedLng,
}: GpsDeviationProps) {
  const isAcceptable = deviationM <= 50;
  const isWarning = deviationM > 50 && deviationM <= 200;

  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-2',
        isAcceptable && 'border-stellar-green/40 bg-stellar-green/5',
        isWarning && 'border-yellow-500/40 bg-yellow-500/5',
        !isAcceptable && !isWarning && 'border-destructive/40 bg-destructive/5'
      )}
      role="status"
      aria-label={`GPS deviation: ${deviationM} metres`}
    >
      <div className="flex items-center gap-2">
        {isAcceptable ? (
          <CheckCircle className="w-4 h-4 text-stellar-green shrink-0" aria-hidden="true" />
        ) : isWarning ? (
          <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" aria-hidden="true" />
        ) : (
          <XCircle className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
        )}
        <Text variant="small" as="span" className="font-semibold">
          GPS Deviation: {deviationM.toFixed(1)} m
        </Text>
        <Badge
          variant={isAcceptable ? 'success' : isWarning ? 'accent' : 'destructive'}
          className="ml-auto"
        >
          {isAcceptable ? 'Acceptable' : isWarning ? 'Review' : 'High Deviation'}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">Submitted: </span>
          {submittedLat.toFixed(6)}, {submittedLng.toFixed(6)}
        </div>
        <div>
          <span className="font-medium text-foreground">Expected: </span>
          {expectedLat.toFixed(6)}, {expectedLng.toFixed(6)}
        </div>
      </div>
    </div>
  );
}

// ── Decision panel ────────────────────────────────────────────────────────────

interface DecisionPanelProps {
  evidenceId: string;
  currentDecision: VerificationDecision;
  onDecision?: (id: string, decision: VerificationDecision, notes: string) => void;
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

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!selected || !onDecision) return;
      onDecision(evidenceId, selected, notes);
    },
    [evidenceId, selected, notes, onDecision]
  );

  const isDecided = currentDecision !== null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label="Verification decision form">
      <fieldset>
        <legend className="text-sm font-semibold mb-2">Verification Decision</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group">
          {(
            [
              {
                value: 'approved' as const,
                label: 'Approve',
                icon: CheckCircle,
                className: 'border-stellar-green/50 data-[selected=true]:bg-stellar-green/10 data-[selected=true]:border-stellar-green hover:border-stellar-green/70 focus-visible:ring-stellar-green',
              },
              {
                value: 'needs_review' as const,
                label: 'Needs Review',
                icon: AlertTriangle,
                className: 'border-yellow-500/50 data-[selected=true]:bg-yellow-500/10 data-[selected=true]:border-yellow-500 hover:border-yellow-500/70 focus-visible:ring-yellow-500',
              },
              {
                value: 'rejected' as const,
                label: 'Reject',
                icon: XCircle,
                className: 'border-destructive/50 data-[selected=true]:bg-destructive/10 data-[selected=true]:border-destructive hover:border-destructive/70 focus-visible:ring-destructive',
              },
            ] as const
          ).map(({ value, label, icon: Icon, className }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected === value}
              data-selected={selected === value}
              onClick={() => setSelected(value)}
              disabled={isDecided || isSubmitting}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                'focus-visible:outline-none focus-visible:ring-2',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                className
              )}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`notes-${evidenceId}`} className="text-sm font-semibold block mb-1">
          Auditor Notes {!isDecided && <span className="text-muted-foreground">(optional)</span>}
        </label>
        <textarea
          id={`notes-${evidenceId}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isDecided || isSubmitting}
          rows={3}
          placeholder="Add notes about your decision (visible to planter and admin)…"
          aria-describedby={`notes-hint-${evidenceId}`}
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'resize-none'
          )}
        />
        <p id={`notes-hint-${evidenceId}`} className="text-xs text-muted-foreground mt-1">
          Notes are recorded in the immutable audit log.
        </p>
      </div>

      {isDecided ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle className="w-4 h-4 text-stellar-green" aria-hidden="true" />
          Decision already recorded: <strong className="capitalize">{currentDecision}</strong>
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

// ── Main organism ─────────────────────────────────────────────────────────────

/**
 * AuditorSatelliteComparison
 *
 * Allows a platform auditor / verifier to compare the satellite baseline image
 * of a tree's expected location against the planter's on-site photo submission.
 * Includes GPS deviation analysis, zoom/pan controls, and a decision form.
 */
export function AuditorSatelliteComparison({
  evidence,
  onDecision,
  isSubmitting = false,
  className,
}: AuditorSatelliteComparisonProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const submittedDate = new Date(evidence.submitted_at);

  const handleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        isFullscreen && 'fixed inset-0 z-50 rounded-none overflow-auto',
        className
      )}
      role="region"
      aria-label={`Satellite photo comparison for tree ${evidence.tree_ref}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-border">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Text variant="h3" as="h2" className="text-base sm:text-lg font-semibold">
              Tree Verification
            </Text>
            <Badge variant="outline" className="font-mono text-xs">
              {evidence.tree_ref}
            </Badge>
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
          <Text variant="muted" as="p" className="text-xs">
            {evidence.species_name} · Submitted by{' '}
            <span className="font-medium text-foreground">{evidence.planter_name}</span> ·{' '}
            <time dateTime={evidence.submitted_at}>
              {submittedDate.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </Text>
        </div>

        <div className="flex items-center gap-2">
          <Text variant="muted" as="span" className="text-xs font-mono hidden sm:block truncate max-w-[200px]">
            {evidence.planter_address.slice(0, 8)}…{evidence.planter_address.slice(-6)}
          </Text>
          <button
            type="button"
            onClick={handleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="p-1.5 rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue transition-colors"
          >
            <Maximize2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Photo comparison grid */}
        <section aria-label="Photo comparison">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ZoomableImage
              src={evidence.baseline_url}
              alt={`Satellite baseline image for tree ${evidence.tree_ref} at expected GPS coordinates`}
              label="Satellite Baseline"
              labelVariant="secondary"
            />
            <ZoomableImage
              src={evidence.submitted_url}
              alt={`Planter-submitted photo for tree ${evidence.tree_ref}`}
              label="Planter Submission"
              labelVariant="accent"
            />
          </div>
        </section>

        {/* GPS analysis */}
        <section aria-label="GPS deviation analysis">
          <Text variant="small" as="h3" className="font-semibold mb-2">
            GPS Analysis
          </Text>
          <GpsDeviation
            deviationM={evidence.gps_deviation_m}
            submittedLat={evidence.submitted_lat}
            submittedLng={evidence.submitted_lng}
            expectedLat={evidence.expected_lat}
            expectedLng={evidence.expected_lng}
          />
        </section>

        {/* Decision */}
        <section aria-label="Auditor decision">
          <Text variant="small" as="h3" className="font-semibold mb-3">
            Auditor Decision
          </Text>
          <DecisionPanel
            evidenceId={evidence.id}
            currentDecision={evidence.current_decision}
            onDecision={onDecision}
            isSubmitting={isSubmitting}
          />
        </section>
      </div>
    </div>
  );
}

AuditorSatelliteComparison.displayName = 'AuditorSatelliteComparison';
