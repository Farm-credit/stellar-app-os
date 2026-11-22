import Link from 'next/link';
import { ExternalLink, ShieldAlert, TreePine } from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import type { SpeciesWithConservation } from '@/lib/species/conservation';

interface SpeciesCardProps {
  species: SpeciesWithConservation;
}

export function SpeciesCard({ species }: SpeciesCardProps) {
  return (
    <article
      className={`flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm ${
        species.isEndangered ? 'border-destructive/40' : 'border-border'
      }`}
      data-testid={`species-card-${species.slug}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stellar-green/10 text-stellar-green">
            <TreePine className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="font-bold leading-tight">{species.name}</h3>
            <p className="text-xs italic text-muted-foreground">{species.scientificName}</p>
          </div>
        </div>
        {species.isEndangered && (
          <Badge variant="destructive" className="shrink-0 gap-1" data-testid="endangered-badge">
            <ShieldAlert className="h-3 w-3" aria-hidden />
            {species.categoryLabel}
          </Badge>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">CO₂ per year</dt>
          <dd className="font-semibold">{species.co2KgPerYear} kg</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Maturity</dt>
          <dd className="font-semibold">{species.maturityYears} years</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        IUCN status: <span className="font-semibold text-foreground">{species.categoryLabel}</span>
      </p>

      {species.isEndangered && species.priorityReason && (
        <div className="mt-3 rounded-lg bg-destructive/5 p-3 text-sm">
          <p className="font-semibold text-destructive">Why it needs priority funding</p>
          <p className="mt-1 text-muted-foreground">{species.priorityReason}</p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-sm">
        <a
          href={species.redListUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-stellar-blue hover:underline"
          aria-label={`View ${species.name} on the IUCN Red List (opens in a new tab)`}
        >
          IUCN Red List <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        <Link href="/donate/trees" className="font-semibold text-stellar-green hover:underline">
          Sponsor this species
        </Link>
      </div>
    </article>
  );
}
