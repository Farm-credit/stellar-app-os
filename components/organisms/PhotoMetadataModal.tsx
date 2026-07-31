import { useEffect, useId, useRef, useState } from 'react';
import { useExifData } from '@/hooks/useExifData';
import { ThumbnailErrorBoundary } from '@/components/molecules/ThumbnailErrorBoundary';
import { formatAltitude, formatCapturedAt, formatCoordinates } from '@/lib/exif/format';
import type { ExifParser, PhotoMetadata } from '@/lib/exif/types';

export interface PhotoMetadataModalProps {
  /** The photo the person just picked. Pass null to keep the modal closed. */
  file: File | null;
  isOpen: boolean;
  onClose: () => void;
  /** Called when the person accepts the extracted details and wants to submit the photo. */
  onConfirm: (metadata: PhotoMetadata | null) => void;
  /**
   * Override for tests, or to swap in a richer parser later.
   * Note: the default parser only reads JPEG's APP1/EXIF segment. HEIC
   * (the default capture format on iPhone unless "Most Compatible" is on)
   * isn't parsed yet - it falls through to the "no GPS data" warning state
   * rather than erroring, but a HEIC-aware parser is a known follow-up.
   */
  parser?: ExifParser;
}

function StatusStamp({ state }: { state: 'locked' | 'missing' | 'reading' }) {
  const copy = {
    locked: 'GPS LOCKED',
    missing: 'NO GPS DATA',
    reading: 'READING\u2026',
  }[state];

  // stellar-navy/stellar-green/stellar-blue are flat single-value brand
  // colors (no 50-900 scale) - opacity modifiers stand in for tints/shades
  // instead of assuming shade steps that don't exist in the design system.
  const tone = {
    locked: 'border-stellar-green text-stellar-green bg-stellar-green/10',
    missing: 'border-red-600 text-red-700 bg-red-50',
    reading: 'border-stellar-navy/30 text-stellar-navy/60 bg-stellar-navy/5',
  }[state];

  return (
    <span
      className={`pointer-events-none absolute -right-3 -top-3 rotate-6 select-none rounded-sm border-2 px-2 py-1 font-mono text-[10px] font-bold tracking-widest shadow-sm ${tone}`}
      data-testid="status-stamp"
    >
      {copy}
    </span>
  );
}

function DataRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: 'ok' | 'missing';
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-stellar-navy/15 py-2.5 last:border-b-0">
      <span className="font-serif text-sm text-stellar-navy/60">{label}</span>
      <span
        className={`font-mono text-sm ${
          status === 'ok' ? 'text-stellar-navy' : 'italic text-stellar-navy/40'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-stellar-navy/15 py-2.5 last:border-b-0">
      <div className="h-3 w-20 animate-pulse rounded bg-stellar-navy/10" />
      <div className="h-3 w-32 animate-pulse rounded bg-stellar-navy/10" />
    </div>
  );
}

export function PhotoMetadataModal({
  file,
  isOpen,
  onClose,
  onConfirm,
  parser,
}: PhotoMetadataModalProps) {
  const { status, metadata, error, retry } = useExifData(file, parser);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!file) {
      setThumbnailUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setThumbnailUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !file) return null;

  const isLoading = status === 'reading';
  const hasGps = status === 'success' && Boolean(metadata?.gps);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stellar-navy/50 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-md rounded-t-2xl border-t-4 border-dashed border-stellar-blue bg-stellar-navy/5 p-5 shadow-xl sm:rounded-2xl sm:border-t-4"
      >
        {status !== 'error' && (
          <StatusStamp state={isLoading ? 'reading' : hasGps ? 'locked' : 'missing'} />
        )}

        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-stellar-blue">
              Field verification ticket
            </p>
            <h2 id={titleId} className="font-serif text-lg font-semibold text-stellar-navy">
              Verify photo details
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-stellar-navy/40 transition hover:bg-stellar-navy/5 hover:text-stellar-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-green"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none">
              <path
                d="M2 2L16 16M16 2L2 16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <ThumbnailErrorBoundary
          fallback={
            <div className="mb-4 flex h-40 items-center justify-center rounded-lg border border-stellar-navy/15 bg-stellar-navy/5 text-sm text-stellar-navy/40">
              Preview unavailable
            </div>
          }
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Tree photo pending submission"
              className="mb-4 h-40 w-full rounded-lg border border-stellar-navy/15 object-cover"
            />
          ) : (
            <div className="mb-4 h-40 w-full animate-pulse rounded-lg bg-stellar-navy/10" />
          )}
        </ThumbnailErrorBoundary>

        {status === 'error' ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700"
          >
            <p className="font-medium">Couldn&apos;t read this photo&apos;s details.</p>
            <p className="mt-0.5 text-red-600">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-2 rounded-md border border-red-400 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="mb-5 rounded-lg bg-stellar-navy/5 px-3">
            {isLoading ? (
              <>
                <RowSkeleton />
                <RowSkeleton />
                <RowSkeleton />
              </>
            ) : (
              <>
                <DataRow
                  label="Location"
                  value={
                    metadata?.gps
                      ? formatCoordinates(metadata.gps) +
                        (metadata.gps.altitude
                          ? ` \u00b7 ${formatAltitude(metadata.gps.altitude)}`
                          : '')
                      : 'No GPS data found'
                  }
                  status={metadata?.gps ? 'ok' : 'missing'}
                />
                <DataRow
                  label="Captured"
                  value={
                    metadata?.capturedAt ? formatCapturedAt(metadata.capturedAt) : 'Not available'
                  }
                  status={metadata?.capturedAt ? 'ok' : 'missing'}
                />
                <DataRow
                  label="Device"
                  value={
                    metadata?.deviceMake || metadata?.deviceModel
                      ? [metadata.deviceMake, metadata.deviceModel].filter(Boolean).join(' ')
                      : 'Unknown device'
                  }
                  status={metadata?.deviceMake || metadata?.deviceModel ? 'ok' : 'missing'}
                />
              </>
            )}
          </div>
        )}

        {!isLoading && status !== 'error' && !hasGps && (
          <p className="mb-4 text-xs leading-relaxed text-stellar-navy/60">
            This photo is missing location data, so it may need manual review before it counts
            toward your credit. You can still submit it.
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-stellar-navy/30 py-2.5 text-sm font-semibold text-stellar-navy transition hover:bg-stellar-navy/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-green"
          >
            Retake photo
          </button>
          <button
            type="button"
            disabled={isLoading || status === 'error'}
            onClick={() => onConfirm(metadata)}
            className="flex-1 rounded-lg bg-stellar-green py-2.5 text-sm font-semibold text-white transition hover:bg-stellar-green/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-green disabled:cursor-not-allowed disabled:bg-stellar-navy/10 disabled:text-stellar-navy/30"
          >
            Confirm &amp; submit
          </button>
        </div>
      </div>
    </div>
  );
}
