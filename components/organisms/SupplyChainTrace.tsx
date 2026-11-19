'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ExternalLink,
  Link2,
  MapPin,
  Sprout,
  User,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import {
  stellarExplorerTxUrl,
  type toPublicTrace,
  type verifyTrace,
  type summarizeTrace,
  type findCreditTrace,
  type TraceEventStage,
  type TracePhotoStage,
} from '@/lib/marketplace/supplyChainTrace';

const STAGE_LABELS: Record<TraceEventStage, string> = {
  planting: 'Planting',
  monitoring: 'Monitoring',
  verification: 'Verification',
  issuance: 'Issuance',
  listing: 'Listing',
  transfer: 'Transfer',
  retirement: 'Retirement',
};

const PHOTO_STAGE_ORDER: TracePhotoStage[] = [
  'planting',
  'growth',
  'sequestration',
  'verification',
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Strictly infer the exact types from the library functions
type PublicTrace = ReturnType<typeof toPublicTrace>;
type VerificationResult = ReturnType<typeof verifyTrace>;
type TraceSummary = ReturnType<typeof summarizeTrace>;
type FoundTrace = NonNullable<ReturnType<typeof findCreditTrace>>;

interface SupplyChainTraceProps {
  trace: PublicTrace;
  verification: VerificationResult;
  summary: TraceSummary;
  found: FoundTrace;
}

export function SupplyChainTrace({ trace, verification, summary, found }: SupplyChainTraceProps) {
  const { farm, farmer } = trace;
  const mapUrl = `https://www.openstreetmap.org/?mlat=${farm.location.lat}&mlon=${farm.location.lng}#map=14/${farm.location.lat}/${farm.location.lng}`;

  return (
    <div className="space-y-8">
      <Link
        href={trace.listingId ? `/marketplace/${trace.listingId}` : '/marketplace'}
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to listing
      </Link>

      <header>
        <Text variant="label">Supply chain trace · {trace.batchId}</Text>
        <Text variant="h1" as="h1" className="mt-1">
          {trace.projectName}
        </Text>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {verification.verified ? (
            <Badge variant="success" className="gap-1 bg-stellar-green text-white">
              <CheckCircle2 className="size-3.5" aria-hidden /> Origin verified
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="size-3.5" aria-hidden /> Origin could not be verified
            </Badge>
          )}
          <Badge variant="outline">{trace.standard}</Badge>
          <Badge variant="outline">Vintage {trace.vintageYear}</Badge>
          <Badge variant="outline">{verification.completeness}% evidence complete</Badge>
        </div>
      </header>

      <section aria-label="Trace summary" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          [`${trace.issuedTonnes} t`, 'CO₂e issued'],
          [`${summary.latestSequestrationTonnes} t`, 'CO₂e measured'],
          [trace.treeCount.toLocaleString('en-US'), 'Trees planted'],
          [`${summary.onChainEvents}`, 'Events anchored on Stellar'],
        ].map(([value, label]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold text-stellar-navy">{value}</p>
              <Text variant="muted">{label}</Text>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-stellar-blue">
              <MapPin className="size-5" aria-hidden /> The farm
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-lg font-semibold">{farm.name}</p>
              <p className="text-muted-foreground">
                {farm.region}, {farm.country}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-muted-foreground">Area</dt>
                <dd className="font-medium">{farm.areaHectares} ha</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Species</dt>
                <dd className="font-medium">{trace.species.join(', ')}</dd>
              </div>
            </dl>
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-stellar-blue hover:underline"
            >
              {farm.location.lat.toFixed(4)}, {farm.location.lng.toFixed(4)} · View on map
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-stellar-blue">
              <User className="size-5" aria-hidden /> The farmer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-4">
              {farmer.photoUrl ? (
                <Image
                  src={farmer.photoUrl}
                  alt={farmer.name}
                  width={64}
                  height={64}
                  className="size-16 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-16 items-center justify-center rounded-full bg-muted">
                  <User className="size-7 text-muted-foreground" aria-hidden />
                </span>
              )}
              <div>
                <p className="text-lg font-semibold">{farmer.name}</p>
                {farmer.cooperative && (
                  <p className="text-muted-foreground">{farmer.cooperative}</p>
                )}
              </div>
            </div>
            <p>{farmer.bio}</p>
            {!found.farmer.consentToShare && (
              <Text variant="muted">Name and photo withheld at the farmer&apos;s request.</Text>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="photos-heading">
        <Text
          variant="h3"
          as="h2"
          id="photos-heading"
          className="mb-4 flex items-center gap-2 text-stellar-blue"
        >
          <Camera className="size-5" aria-hidden /> Field evidence
        </Text>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...trace.photos]
            .sort(
              (a, b) =>
                PHOTO_STAGE_ORDER.indexOf(a.stage) - PHOTO_STAGE_ORDER.indexOf(b.stage) ||
                a.takenAt.localeCompare(b.takenAt)
            )
            .map((photo) => (
              <figure key={photo.id} className="overflow-hidden rounded-lg border bg-card">
                <div className="relative aspect-4/3">
                  <Image src={photo.url} alt={photo.caption} fill className="object-cover" />
                  <Badge className="absolute left-2 top-2 capitalize">{photo.stage}</Badge>
                </div>
                <figcaption className="space-y-0.5 p-3 text-sm">
                  <p className="font-medium">{photo.caption}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(photo.takenAt)} · {photo.capturedBy}
                  </p>
                </figcaption>
              </figure>
            ))}
        </div>
      </section>

      <section aria-labelledby="timeline-heading">
        <Text
          variant="h3"
          as="h2"
          id="timeline-heading"
          className="mb-4 flex items-center gap-2 text-stellar-blue"
        >
          <Sprout className="size-5" aria-hidden /> Chain of custody
        </Text>
        <ol className="relative space-y-6 border-l border-stellar-blue/30 pl-6">
          {trace.events.map((event) => (
            <li key={event.id} className="relative">
              <span
                className="absolute -left-7.75 top-1 size-3 rounded-full bg-stellar-green ring-4 ring-background"
                aria-hidden
              />
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {STAGE_LABELS[event.stage as TraceEventStage]} · {formatDate(event.occurredAt)}
              </p>
              <p className="font-semibold">{event.title}</p>
              <p className="text-sm text-muted-foreground">{event.description}</p>
              {event.txHash && (
                <a
                  href={stellarExplorerTxUrl(event.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm text-stellar-blue hover:underline"
                >
                  <Link2 className="size-3.5" aria-hidden />
                  On-chain record {event.txHash.slice(0, 8)}…
                </a>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
