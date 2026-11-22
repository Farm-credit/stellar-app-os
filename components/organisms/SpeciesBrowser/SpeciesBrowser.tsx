'use client';

import { useMemo, useState, type JSX } from 'react';
import { ShieldAlert } from 'lucide-react';
import { SpeciesCard } from './SpeciesCard';
import { getSpeciesWithConservation } from '@/lib/species/conservation';

type Tab = 'all' | 'endangered';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All species' },
  { id: 'endangered', label: 'Endangered Species' },
];

/**
 * Species sponsorship browse view with a dedicated Endangered Species tab that
 * lists threatened species first by urgency (#1642).
 */
export function SpeciesBrowser({ initialTab = 'all' }: { initialTab?: Tab }): JSX.Element {
  const [tab, setTab] = useState<Tab>(initialTab);

  const species = useMemo(() => getSpeciesWithConservation(), []);
  const endangeredCount = species.filter((s) => s.isEndangered).length;
  const visible = useMemo(
    () =>
      tab === 'endangered'
        ? species.filter((s) => s.isEndangered)
        : [...species].sort((a, b) => Number(b.isEndangered) - Number(a.isEndangered)),
    [species, tab]
  );

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Species views" className="flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`species-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="species-panel"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.id
                ? 'border-stellar-green text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.id === 'endangered' && (
              <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                {endangeredCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div id="species-panel" role="tabpanel" aria-labelledby={`species-tab-${tab}`}>
        {tab === 'endangered' && (
          <div className="mb-6 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p>
              These species are listed as threatened on the IUCN Red List. Wild populations are
              declining, so funding their planting has an outsized conservation impact. They are
              ordered by how urgently they need support.
            </p>
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <SpeciesCard key={s.slug} species={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
