'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Info,
  Ruler,
  Sparkles,
  TreePine,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import {
  AR_PROJECTION_YEARS,
  formatHeight,
  maturityLabel,
  projectionYearAt,
} from '@/lib/ar/projection';
import type { ARCameraStatus, TreeARProjection } from '@/lib/types/tree-ar';
import { cn } from '@/lib/utils';

interface ARTreeViewerProps {
  projection: TreeARProjection;
  /** Where the "back" link points. */
  backHref?: string;
}

/** Average adult height, used for the on-screen scale comparison. */
const HUMAN_HEIGHT_CM = 175;

const CAMERA_MESSAGES: Record<ARCameraStatus, string> = {
  unsupported: 'This browser cannot open a camera stream — showing the studio preview.',
  idle: 'Start the camera to place your tree in the room around you.',
  starting: 'Requesting camera access…',
  active: 'Camera live — move your phone to place the tree.',
  denied: 'Camera access was blocked. You can still explore the growth preview below.',
  error: 'The camera stopped unexpectedly. Restart it to place your tree.',
};

const QUICK_JUMPS = [
  { year: 0, label: 'Planting' },
  { year: 5, label: '+5 years' },
  { year: 10, label: '+10 years' },
  { year: AR_PROJECTION_YEARS, label: 'Maturity' },
];

function TreeSilhouette({ species, year }: { species: string; year: number }) {
  return (
    <svg
      viewBox="0 0 100 200"
      preserveAspectRatio="xMidYMax meet"
      className="h-full w-full drop-shadow-[0_10px_25px_rgba(0,0,0,0.55)]"
      role="img"
      aria-label={`${species} at year ${year}`}
    >
      <defs>
        <linearGradient id="ar-canopy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
      {/* Trunk */}
      <rect x="46" y="110" width="8" height="90" rx="3" fill="#78502c" />
      {/* Canopy */}
      <ellipse cx="50" cy="86" rx="36" ry="44" fill="url(#ar-canopy)" />
      <ellipse cx="28" cy="108" rx="22" ry="26" fill="#16a34a" opacity="0.92" />
      <ellipse cx="72" cy="108" rx="22" ry="26" fill="#16a34a" opacity="0.92" />
      <ellipse cx="50" cy="58" rx="24" ry="24" fill="#22c55e" opacity="0.95" />
    </svg>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950/70 px-3 py-2 backdrop-blur">
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

/**
 * WebAR 20-year growth view for one sponsored tree (Issue #1106).
 *
 * Uses the device camera as the AR background and anchors a scaled growth
 * overlay to the ground plane. Deliberately dependency-free: the 3D engine
 * integration point is documented in `docs/ar-tree-viewer.md`.
 */
export function ARTreeViewer({ projection, backHref = '/dashboard/trees' }: ARTreeViewerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraStatus, setCameraStatus] = useState<ARCameraStatus>('idle');
  const [year, setYear] = useState(projection.defaultYear);
  const [tilt, setTilt] = useState(0);
  const [captured, setCaptured] = useState(false);

  const activeYear = useMemo(() => projectionYearAt(projection, year), [projection, year]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Never leave the camera light on when the viewer unmounts.
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(async () => {
    const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      setCameraStatus('unsupported');
      return;
    }

    setCameraStatus('starting');
    try {
      const stream = await mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play?.();
        } catch {
          // jsdom and some embedded browsers have no media pipeline; the
          // stream is still attached and will play once possible.
        }
      }
      setCameraStatus('active');
    } catch {
      setCameraStatus('denied');
    }
  }, []);

  // Subtle parallax: the overlay leans with the device so it reads as anchored.
  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const gamma = typeof event.gamma === 'number' ? event.gamma : 0;
      setTilt(Math.max(-14, Math.min(14, gamma / 4)));
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || cameraStatus !== 'active') return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 1280;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${projection.treeId}-year-${activeYear.year}.png`;
      link.click();
      setCaptured(true);
    } catch {
      setCameraStatus('error');
    }
  }, [activeYear.year, cameraStatus, projection.treeId]);

  const personBarPx = 90;
  const treeBarPx = Math.max(
    6,
    Math.min((activeYear.heightCm / HUMAN_HEIGHT_CM) * personBarPx, personBarPx * 4)
  );
  const overlayHeight = 48 + activeYear.scale * 380;
  const overlayWidth = 34 + activeYear.scale * 190;

  return (
    <section
      data-testid="ar-tree-viewer"
      aria-labelledby="ar-viewer-heading"
      className="mx-auto max-w-3xl px-4 py-6 sm:py-10"
    >
      <Link
        href={backHref}
        className="mb-6 inline-flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to my forest
      </Link>

      <header className="mb-6 space-y-2">
        <Text variant="label" as="p">
          Augmented reality
        </Text>
        <Text variant="h2" as="h1" id="ar-viewer-heading" className="text-2xl sm:text-3xl">
          See your {projection.species} at maturity
        </Text>
        <Text variant="muted" as="p">
          {projection.treeId} · {projection.region} · {projection.projectName}
        </Text>
      </header>

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border bg-slate-950">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-hidden
          tabIndex={-1}
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            cameraStatus === 'active' ? 'opacity-100' : 'opacity-0'
          )}
        />

        {cameraStatus !== 'active' ? (
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-sky-900 via-emerald-950 to-slate-950"
          />
        ) : null}

        {/* Ground plane */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/75 to-transparent"
        />

        {/* Anchored growth overlay */}
        <div
          data-testid="ar-tree-overlay"
          className="absolute inset-x-0 bottom-[14%] flex items-end justify-center transition-all duration-500 ease-out"
          style={{ height: overlayHeight, transform: `rotate(${tilt}deg)` }}
        >
          <div style={{ height: overlayHeight, width: overlayWidth }}>
            <TreeSilhouette species={projection.species} year={activeYear.year} />
          </div>
        </div>

        {/* Ground shadow */}
        <div
          aria-hidden
          className="absolute bottom-[13%] left-1/2 -translate-x-1/2 rounded-[100%] bg-black/45 blur-md transition-all duration-500"
          style={{ height: 14, width: 60 + activeYear.scale * 180 }}
        />

        {/* HUD */}
        <div className="absolute inset-x-0 top-0 flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              Year {activeYear.year}
              {activeYear.year === 0 ? ' · just planted' : ''}
            </span>
            <span className="rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur">
              {maturityLabel(activeYear)}
            </span>
          </div>
          {cameraStatus !== 'active' ? (
            <span className="self-center rounded-full bg-slate-950/70 px-3 py-1 text-xs text-slate-300 backdrop-blur">
              Studio preview — point your camera at the room to place the tree
            </span>
          ) : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric icon={Ruler} label="Height" value={formatHeight(activeYear.heightCm)} />
            <Metric icon={TreePine} label="Canopy" value={formatHeight(activeYear.canopyCm)} />
            <Metric icon={Wind} label="CO₂ / yr" value={`${activeYear.annualCo2Kg} kg`} />
            <Metric icon={Sparkles} label="CO₂ total" value={`${activeYear.cumulativeCo2Kg} kg`} />
          </div>
        </div>
      </div>

      {/* Camera controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void startCamera()}
          disabled={cameraStatus === 'starting'}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-stellar-green px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-stellar-green/90 disabled:opacity-60"
        >
          {cameraStatus === 'active' ? (
            <Camera className="h-4 w-4" aria-hidden />
          ) : (
            <CameraOff className="h-4 w-4" aria-hidden />
          )}
          {cameraStatus === 'active' ? 'Camera live' : 'Start camera'}
        </button>

        <button
          type="button"
          onClick={handleCapture}
          disabled={cameraStatus !== 'active'}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          <Camera className="h-4 w-4" aria-hidden />
          Capture photo
        </button>

        {cameraStatus === 'active' ? (
          <button
            type="button"
            onClick={stopCamera}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Stop camera
          </button>
        ) : null}
      </div>

      <p
        data-testid="ar-camera-status"
        role="status"
        aria-live="polite"
        className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {CAMERA_MESSAGES[cameraStatus]}
      </p>

      {captured ? (
        <p role="status" className="mt-1 text-sm text-stellar-green">
          Photo saved — check your downloads.
        </p>
      ) : null}

      {/* Growth scrubber */}
      <div className="mt-8 rounded-xl border border-border bg-card p-4">
        <label htmlFor="ar-year" className="text-sm font-medium">
          Tree age
        </label>
        <div className="mt-2 flex items-center gap-3">
          <input
            id="ar-year"
            type="range"
            min={0}
            max={AR_PROJECTION_YEARS}
            step={1}
            value={activeYear.year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-valuetext={`Year ${activeYear.year} of ${AR_PROJECTION_YEARS}`}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-stellar-green"
          />
          <output htmlFor="ar-year" className="w-16 shrink-0 text-right text-sm font-semibold">
            {activeYear.year} yr
          </output>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_JUMPS.map((jump) => (
            <button
              key={jump.label}
              type="button"
              aria-pressed={activeYear.year === jump.year}
              onClick={() => setYear(jump.year)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                activeYear.year === jump.year
                  ? 'border-stellar-green bg-stellar-green text-white'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {jump.label}
            </button>
          ))}
          {projection.planted ? (
            <button
              type="button"
              aria-pressed={activeYear.year === projection.currentAgeYears}
              onClick={() => setYear(projection.currentAgeYears)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                activeYear.year === projection.currentAgeYears
                  ? 'border-stellar-green bg-stellar-green text-white'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              Today ({projection.currentAgeLabel})
            </button>
          ) : null}
        </div>
      </div>

      {/* Scale comparison */}
      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium">Scale against a person</p>
        <div className="mt-3 flex items-end gap-4">
          <div className="flex flex-col items-center">
            <div aria-hidden className="w-2 rounded-t bg-sky-400" style={{ height: personBarPx }} />
            <span className="mt-1 text-xs text-muted-foreground">1.75 m</span>
          </div>
          <div className="flex flex-col items-center">
            <div
              aria-hidden
              className="w-2 rounded-t bg-stellar-green"
              style={{ height: treeBarPx }}
            />
            <span className="mt-1 text-xs text-muted-foreground">
              {formatHeight(activeYear.heightCm)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            At year {activeYear.year}, your tree is{' '}
            <strong className="text-foreground">{maturityLabel(activeYear)}</strong> and will have
            absorbed <strong className="text-foreground">{activeYear.cumulativeCo2Kg} kg</strong> of
            CO₂. At maturity it is projected to reach{' '}
            <strong className="text-foreground">{formatHeight(projection.matureHeightCm)}</strong>{' '}
            and absorb{' '}
            <strong className="text-foreground">
              {projection.lifetimeCo2Tonnes} tonnes of CO₂
            </strong>{' '}
            over 20 years.
          </p>
        </div>
      </div>
    </section>
  );
}
