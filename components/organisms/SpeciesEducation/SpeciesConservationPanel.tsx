import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PopulationTrend } from '@/lib/species/conservation';

export interface SpeciesConservationStatus {
  statusCode: string | null;
  statusLabel: string | null;
  populationTrend: PopulationTrend | null;
  isThreatened: boolean;
  assessedAt: string | null;
  iucnUrl: string | null;
  lastCheckQuarter: string | null;
}

const STATUS_TONES: Record<string, string> = {
  EX: 'bg-red-600 text-white',
  EW: 'bg-red-600 text-white',
  CR: 'bg-red-600 text-white',
  EN: 'bg-orange-600 text-white',
  VU: 'bg-amber-500 text-white',
  NT: 'bg-yellow-500 text-white',
  LC: 'bg-green-600 text-white',
  DD: 'bg-slate-500 text-white',
  NE: 'bg-slate-400 text-white',
};

/**
 * Renders the cached IUCN Red List assessment for a species. Server component —
 * the status itself is fetched in the page and passed in, so this stays a pure
 * presentational piece.
 */
export function SpeciesConservationPanel({
  status,
  commonName,
}: {
  status: SpeciesConservationStatus | null;
  commonName: string;
}): React.ReactElement {
  if (!status || !status.statusCode) {
    return (
      <section
        aria-labelledby="iucn-status-heading"
        className="mb-8 rounded-xl border border-border bg-background p-5"
      >
        <h2
          id="iucn-status-heading"
          className="mb-1 flex items-center gap-2 text-base font-semibold"
        >
          <ShieldQuestion className="size-5 text-muted-foreground" aria-hidden="true" />
          IUCN Red List status
        </h2>
        <p className="text-sm text-muted-foreground">
          {commonName} has not yet been assessed in our quarterly conservation check. We refresh
          every catalogue species against the IUCN Red List four times a year; once a status is
          available it will appear here and sponsors will be alerted to any change.
        </p>
      </section>
    );
  }

  const tone = STATUS_TONES[status.statusCode] ?? 'bg-slate-500 text-white';
  const Icon = status.isThreatened ? ShieldAlert : ShieldCheck;

  return (
    <section
      aria-labelledby="iucn-status-heading"
      className={cn(
        'mb-8 rounded-xl border p-5',
        status.isThreatened
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
          : 'border-border bg-background'
      )}
    >
      <h2 id="iucn-status-heading" className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Icon
          className={cn('size-5', status.isThreatened ? 'text-amber-600' : 'text-green-600')}
          aria-hidden="true"
        />
        IUCN Red List status
      </h2>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold',
            tone
          )}
        >
          {status.statusLabel ?? status.statusCode}
        </span>
        {status.populationTrend && (
          <span className="text-sm text-muted-foreground">
            Population trend: <strong>{status.populationTrend}</strong>
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        {status.assessedAt && (
          <p>
            Assessed by IUCN:{' '}
            {new Date(status.assessedAt).toLocaleDateString('en-GB', {
              year: 'numeric',
              month: 'long',
            })}
          </p>
        )}
        {status.lastCheckQuarter && <p>Last checked on our platform: {status.lastCheckQuarter}</p>}
        {status.iucnUrl && (
          <p>
            <a
              href={status.iucnUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-stellar-green underline-offset-2 hover:underline"
            >
              Read the full IUCN assessment
            </a>
          </p>
        )}
      </div>

      {status.isThreatened && (
        <p className="mt-3 border-t border-amber-200 pt-3 text-sm text-muted-foreground dark:border-amber-900">
          This species is classified as threatened. Sponsors of {commonName} trees receive an in-app
          notification and an email whenever the IUCN category is newly listed or upgraded.
        </p>
      )}
    </section>
  );
}
