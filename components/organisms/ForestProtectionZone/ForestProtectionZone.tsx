'use client';

/**
 * ForestProtectionZone
 *
 * Implements issue #1714 — Forest Protection Zone Designation for Project Buffers.
 *
 * Acceptance criteria:
 *   ✓ Buffer zone polygon drawn on project map
 *   ✓ Protection zone area in hectares displayed on project page
 *   ✓ Alerts if any deforestation is detected inside buffer zone
 */

import dynamic from 'next/dynamic';
import { ShieldCheck, AlertTriangle, MapPin, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/ui/badge';
import type { ProjectBufferZone } from '@/lib/types/adminProject';
import type { DeforestationAlert } from '@/lib/deforestation/types';

// Load the Leaflet map without SSR — required because Leaflet uses browser-only APIs.
const ForestProtectionZoneMap = dynamic(
  () =>
    import('@/components/organisms/ForestProtectionZone/ForestProtectionZoneMap').then(
      (m) => m.ForestProtectionZoneMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 w-full items-center justify-center rounded-xl bg-muted animate-pulse" />
    ),
  }
);

interface ForestProtectionZoneProps {
  bufferZone: ProjectBufferZone;
  /** Project centre coordinate for the map marker [lat, lng]. */
  projectCenter?: [number, number];
  /** Detected canopy-loss alerts for this zone (issue #672). */
  alerts?: DeforestationAlert[];
  className?: string;
}

export function ForestProtectionZone({
  bufferZone,
  projectCenter,
  alerts = [],
  className,
}: ForestProtectionZoneProps) {
  const latestAlert = alerts[0];
  const hasAlert = bufferZone.deforestationAlert || alerts.length > 0;

  return (
    <section
      className={cn(
        'mx-auto max-w-7xl space-y-5 rounded-2xl border bg-card px-4 py-8 sm:px-8',
        hasAlert ? 'border-red-300 dark:border-red-800' : 'border-border',
        className
      )}
      aria-labelledby="fpz-heading"
    >
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'rounded-lg p-2',
              hasAlert
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-stellar-green/10 text-stellar-green'
            )}
          >
            {hasAlert ? (
              <AlertTriangle className="h-5 w-5" aria-hidden />
            ) : (
              <ShieldCheck className="h-5 w-5" aria-hidden />
            )}
          </div>
          <div>
            <Text variant="h4" as="h2" id="fpz-heading">
              Forest Protection Buffer Zone
            </Text>
            <Text variant="muted" className="text-xs">
              {bufferZone.designationLabel ?? 'Designated reforestation buffer zone'}
            </Text>
          </div>
        </div>

        <Badge variant={hasAlert ? 'destructive' : 'secondary'} className="text-sm">
          {hasAlert ? '⚠ Deforestation Alert' : '✓ Protected'}
        </Badge>
      </div>

      {/* ── Deforestation Alert Banner (issue #672) ── */}
      {hasAlert && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p>
              <strong>Deforestation detected</strong> inside this project&apos;s forest protection
              buffer zone. Satellite imagery indicates recent canopy loss. Verification teams have
              been notified.
            </p>
            {latestAlert && (
              <p className="text-xs">
                Latest detection: {latestAlert.detectedOn} ·{' '}
                {latestAlert.areaHectares > 0
                  ? `${latestAlert.areaHectares.toLocaleString()} ha affected · `
                  : ''}
                Confidence: {latestAlert.confidence} · Source:{' '}
                {latestAlert.source === 'gfw' ? 'Global Forest Watch' : 'GFW alert feed (mock)'}
                {alerts.length > 1 ? ` · ${alerts.length} alerts in total` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs font-medium text-muted-foreground">Buffer area</p>
          <p className="text-2xl font-bold text-foreground">
            {bufferZone.areaHectares.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">hectares</p>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <p
            className={cn(
              'text-lg font-bold',
              hasAlert ? 'text-red-600 dark:text-red-400' : 'text-stellar-green'
            )}
          >
            {hasAlert ? 'Alert' : 'Secure'}
          </p>
          <p className="text-xs text-muted-foreground">deforestation check</p>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs font-medium text-muted-foreground">Boundary</p>
          <p className="text-lg font-bold">{bufferZone.polygonCoordinates.length}</p>
          <p className="text-xs text-muted-foreground">vertices defined</p>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs font-medium text-muted-foreground">Last checked</p>
          <p className="text-sm font-semibold">
            {bufferZone.lastCheckedAt
              ? new Date(bufferZone.lastCheckedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'N/A'}
          </p>
          <p className="text-xs text-muted-foreground">satellite scan</p>
        </div>
      </div>

      {/* ── Map ── */}
      <div className="h-72 w-full overflow-hidden rounded-xl border border-border">
        <ForestProtectionZoneMap
          bufferZone={bufferZone}
          center={projectCenter}
          zoom={9}
          alerts={alerts}
        />
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-stellar-blue" aria-hidden />
          <span>Project site</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-block h-3 w-5 rounded-sm border-2',
              hasAlert ? 'border-red-500 bg-red-100' : 'border-stellar-green bg-stellar-green/10'
            )}
            aria-hidden
          />
          <span>Protection buffer zone</span>
        </div>
        {alerts.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-5 rounded-sm border-2 border-red-500 bg-red-400/60"
              aria-hidden
            />
            <span>Detected canopy loss</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Info className="h-3 w-3" aria-hidden />
          <span>Data from OpenStreetMap. Buffer boundaries are approximate.</span>
        </div>
      </div>
    </section>
  );
}
