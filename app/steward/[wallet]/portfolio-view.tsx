import { Award, Leaf, Sprout } from 'lucide-react';
import { ImpactStatCard } from '@/components/atoms/ImpactStatCard';
import type { StewardPortfolio } from '@/lib/api/steward-portfolio';

interface StewardPortfolioViewProps {
  portfolio: StewardPortfolio;
}

export function StewardPortfolioView({ portfolio }: StewardPortfolioViewProps) {
  const { address, name, trees, species, co2OffsetTonnes, impactScore } = portfolio;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
          Public steward portfolio
        </p>
        <h1 className="text-3xl font-semibold text-foreground">{name ?? 'Steward'}</h1>
        <p className="break-all font-mono text-sm text-muted-foreground">{address}</p>
      </header>

      <section
        aria-label="Steward impact statistics"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <ImpactStatCard
          label="Trees sponsored"
          value={trees.length.toLocaleString()}
          icon={<Sprout className="h-5 w-5" aria-hidden="true" />}
        />
        <ImpactStatCard
          label="Estimated CO₂ offset"
          value={`${co2OffsetTonnes.toLocaleString()} t`}
          icon={<Leaf className="h-5 w-5" aria-hidden="true" />}
        />
        <ImpactStatCard
          label={`Impact score · ${impactScore.tier}`}
          value={`${impactScore.totalScore.toLocaleString()} / ${impactScore.maxScore.toLocaleString()}`}
          icon={<Award className="h-5 w-5" aria-hidden="true" />}
        />
      </section>

      {trees.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-xl font-semibold text-foreground">No trees yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This steward has no tree planting activity to show yet.
          </p>
        </section>
      ) : (
        <section
          aria-labelledby="steward-species-heading"
          className="rounded-2xl border bg-card p-6"
        >
          <h2 id="steward-species-heading" className="text-xl font-semibold text-foreground">
            Species planted
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {species.map((entry) => (
              <li key={entry.species} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm text-foreground">{entry.species}</span>
                <span className="text-sm font-medium text-muted-foreground">
                  {entry.count.toLocaleString()} {entry.count === 1 ? 'tree' : 'trees'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
