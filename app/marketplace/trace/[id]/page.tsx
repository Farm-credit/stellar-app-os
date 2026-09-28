import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ExternalLink,
  Leaf,
  Link2,
  MapPin,
  Sprout,
  User,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import {
  findCreditTrace,
  stellarExplorerTxUrl,
  summarizeTrace,
  toPublicTrace,
  verifyTrace,
  type TraceEventStage,
  type TracePhotoStage,
} from '@/lib/marketplace/supplyChainTrace';

interface TracePageProps {
  params: Promise<{ id: string }>;
}

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

export async function generateMetadata({ params }: TracePageProps): Promise<Metadata> {
  const { id } = await params;
  const trace = findCreditTrace(id);
  return {
    title: trace ? `Credit origin · ${trace.projectName}` : 'Credit origin not found',
    description: trace
      ? `Trace ${trace.issuedTonnes} t CO₂e back to ${trace.farm.name}, ${trace.farm.country}.`
      : undefined,
  };
}

/**
 * Supply chain tracing — Issue #1420
 *
 * Shows buyers exactly where a carbon credit came from: the farm, the farmer,
 * planting and sequestration photos, measured carbon and every custody event.
 */
export default async function CreditTracePage({ params }: TracePageProps) {
  const { id } = await params;
  const found = findCreditTrace(id);
  if (!found) notFound();

  const trace = toPublicTrace(found);
  const verification = verifyTrace(found);
  const summary = summarizeTrace(found);
  const { farm, farmer } = trace;
  const photosById = new Map(trace.photos.map((p) => [p.id, p]));
  const maxSequestration = Math.max(...trace.sequestration.map((s) => s.cumulativeTonnes), 1);
  const mapUrl = `https://www.openstreetmap.org/?mlat=${farm.location.lat}&mlon=${farm.location.lng}#map=14/${farm.location.lat}/${farm.location.lng}`;

  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <Link
        href={trace.listingId ? `/marketplace/${trace.listingId}` : '/marketplace'}
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to listing
      </Link>

      <header className="mb-8">
        <Text variant="label">Supply chain trace · {trace.batchId}</Text>
        <Text variant="h1" as="h1" className="mt-1">
          {trace.projectName}
        </Text>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {verification.verified ? (
            <Badge variant="success" className="gap-1">
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

      <section aria-label="Trace summary" className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          [`${trace.issuedTonnes} t`, 'CO₂e issued'],
          [`${summary.latestSequestrationTonnes} t`, 'CO₂e measured'],
          [trace.treeCount.toLocaleString('en-US'), 'Trees planted'],
          [`${summary.onChainEvents}`, 'Events anchored on Stellar'],
        ].map(([value, label]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">{value}</p>
              <Text variant="muted">{label}</Text>
            </CardContent>
          </Card>
        ))}
      </section>

      {verification.issues.length > 0 && (
        <Card className="mb-8 border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-500" aria-hidden /> Evidence notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {verification.issues.map((issue) => (
                <li key={`${issue.code}-${issue.message}`}>
                  <span className="font-medium capitalize">{issue.severity}:</span> {issue.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-5 text-stellar-green" aria-hidden /> The farm
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
              <div className="col-span-2">
                <dt className="text-muted-foreground">Land use</dt>
                <dd className="font-medium">{farm.landUse}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-1.5">
              {farm.certifications.map((c) => (
                <Badge key={c} variant="secondary">
                  {c}
                </Badge>
              ))}
            </div>
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
            <CardTitle className="flex items-center gap-2">
              <User className="size-5 text-stellar-green" aria-hidden /> The farmer
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
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="text-muted-foreground">Farming</dt>
                <dd className="font-medium">{farmer.yearsFarming} yrs</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Trees planted</dt>
                <dd className="font-medium">{farmer.treesPlanted.toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Member since</dt>
                <dd className="font-medium">{formatDate(farmer.joinedAt)}</dd>
              </div>
            </dl>
            {!found.farmer.consentToShare && (
              <Text variant="muted">Name and photo withheld at the farmer&apos;s request.</Text>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="photos-heading" className="mb-8">
        <Text variant="h3" as="h2" id="photos-heading" className="mb-4 flex items-center gap-2">
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
                <div className="relative aspect-[4/3]">
                  <Image
                    src={photo.url}
                    alt={photo.caption}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                  <Badge className="absolute left-2 top-2 capitalize">{photo.stage}</Badge>
                </div>
                <figcaption className="space-y-0.5 p-3 text-sm">
                  <p className="font-medium">{photo.caption}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(photo.takenAt)} · {photo.capturedBy}
                    {photo.location &&
                      ` · ${photo.location.lat.toFixed(4)}, ${photo.location.lng.toFixed(4)}`}
                  </p>
                </figcaption>
              </figure>
            ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="timeline-heading">
          <Text variant="h3" as="h2" id="timeline-heading" className="mb-4 flex items-center gap-2">
            <Sprout className="size-5" aria-hidden /> Chain of custody
          </Text>
          <ol className="relative space-y-6 border-l pl-6">
            {trace.events.map((event) => (
              <li key={event.id} className="relative">
                <span
                  className="absolute -left-[31px] top-1 size-3 rounded-full bg-stellar-green ring-4 ring-background"
                  aria-hidden
                />
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {STAGE_LABELS[event.stage]} · {formatDate(event.occurredAt)}
                </p>
                <p className="font-semibold">{event.title}</p>
                <p className="text-sm text-muted-foreground">{event.description}</p>
                <p className="text-sm">By {event.actor}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-sm">
                  {event.txHash && (
                    <a
                      href={stellarExplorerTxUrl(event.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-stellar-blue hover:underline"
                    >
                      <Link2 className="size-3.5" aria-hidden />
                      On-chain record {event.txHash.slice(0, 8)}…
                    </a>
                  )}
                  {event.photoIds
                    ?.map((pid) => photosById.get(pid))
                    .filter((photo) => photo !== undefined)
                    .map((photo) => (
                      <span
                        key={photo.id}
                        className="inline-flex items-center gap-1 text-muted-foreground"
                      >
                        <Camera className="size-3.5" aria-hidden /> {photo.caption}
                      </span>
                    ))}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="sequestration-heading">
          <Text
            variant="h3"
            as="h2"
            id="sequestration-heading"
            className="mb-4 flex items-center gap-2"
          >
            <Leaf className="size-5" aria-hidden /> Sequestration
          </Text>
          <Card>
            <CardContent className="space-y-4 pt-6">
              {trace.sequestration.map((m) => (
                <div key={m.measuredAt}>
                  <div className="flex justify-between text-sm">
                    <span>{formatDate(m.measuredAt)}</span>
                    <span className="font-semibold">{m.cumulativeTonnes} t CO₂e</span>
                  </div>
                  <div
                    className="mt-1 h-2 rounded-full bg-muted"
                    role="img"
                    aria-label={`${m.cumulativeTonnes} tonnes measured by ${m.method}`}
                  >
                    <div
                      className="h-2 rounded-full bg-stellar-green"
                      style={{ width: `${(m.cumulativeTonnes / maxSequestration) * 100}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.method}</p>
                </div>
              ))}
              <Text variant="muted">
                {Math.round(summary.issuanceCoverage * 100)}% of measured carbon has been issued as
                credits, leaving a buffer against reversals.
              </Text>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
