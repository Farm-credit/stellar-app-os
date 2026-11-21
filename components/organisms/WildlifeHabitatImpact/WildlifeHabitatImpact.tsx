'use client';

/**
 * WildlifeHabitatImpact — Issue #1665
 *
 * Wildlife habitat impact metrics per forest project:
 * - Habitat quality score derived from sighting diversity (with the
 *   methodology explanation in a tooltip)
 * - Species richness, taxonomic groups, Shannon index
 * - Featured wildlife photos from approved sightings
 * - Recent approved sighting log entries
 *
 * Loads from GET /api/wildlife/habitat on mount (which also seeds the demo
 * baseline log for the project).
 */

import { useEffect, useId, useState } from 'react';
import { Bird, Info, Leaf, PawPrint, Ruler } from 'lucide-react';

import { HABITAT_SCORE_METHOD } from '@/lib/wildlife/habitat';
import type { WildlifeHabitatSnapshot } from '@/lib/wildlife/types';
import { cn } from '@/lib/utils';

interface WildlifeHabitatImpactProps {
  projectId: string;
  className?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function groupLabel(group: string): string {
  return group.charAt(0).toUpperCase() + group.slice(1);
}

export function WildlifeHabitatImpact({ projectId, className }: WildlifeHabitatImpactProps) {
  const [snapshot, setSnapshot] = useState<WildlifeHabitatSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const methodologyId = useId();

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const response = await fetch(
          `/api/wildlife/habitat?projectId=${encodeURIComponent(projectId)}`
        );
        if (!response.ok) throw new Error(`habitat API ${response.status}`);
        const data = (await response.json()) as WildlifeHabitatSnapshot;
        if (!cancelled) setSnapshot(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <section
      id="wildlife"
      aria-labelledby="wildlife-heading"
      className={cn('space-y-6', className)}
    >
      <div className="flex items-center gap-2">
        <PawPrint className="h-5 w-5 text-stellar-green" aria-hidden />
        <h3 id="wildlife-heading" className="text-xl font-semibold text-foreground">
          Wildlife Habitat Impact
        </h3>
        <div className="h-px flex-1 bg-stellar-blue/20 ml-4" />
      </div>

      {error && (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Wildlife sighting data is unavailable right now.
        </p>
      )}

      {!snapshot && !error && (
        <div className="h-40 w-full animate-pulse rounded-2xl border border-border bg-muted" />
      )}

      {snapshot && (
        <>
          {/* ── Habitat quality score ── */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-stellar-green" aria-hidden />
                  <p className="text-sm font-medium text-muted-foreground">Habitat quality score</p>

                  <span className="relative inline-flex items-center">
                    <button
                      type="button"
                      aria-label="How is the habitat quality score calculated?"
                      aria-expanded={methodologyOpen}
                      aria-controls={methodologyId}
                      onMouseEnter={() => setMethodologyOpen(true)}
                      onMouseLeave={() => setMethodologyOpen(false)}
                      onFocus={() => setMethodologyOpen(true)}
                      onBlur={() => setMethodologyOpen(false)}
                      className="rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                    >
                      <Info className="h-4 w-4" aria-hidden />
                    </button>
                    {methodologyOpen && (
                      <span
                        id={methodologyId}
                        role="tooltip"
                        className="absolute left-0 top-full z-20 mt-2 block w-80 rounded-lg border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-lg"
                      >
                        {HABITAT_SCORE_METHOD}
                      </span>
                    )}
                  </span>
                </div>

                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-4xl font-bold text-foreground">
                    {snapshot.score.score}
                    <span className="text-xl text-muted-foreground">/100</span>
                  </span>
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                      snapshot.score.score >= 60
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : snapshot.score.score >= 40
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-red-200 bg-red-50 text-red-700'
                    )}
                  >
                    {snapshot.score.interpretation}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Bird className="h-3 w-3" aria-hidden /> Species
                  </p>
                  <p className="font-semibold">{snapshot.score.speciesRichness}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Groups</p>
                  <p className="font-semibold">{snapshot.score.taxonomicGroupCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Shannon H′</p>
                  <p className="font-semibold">{snapshot.score.shannonIndex.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sightings</p>
                  <p className="font-semibold">
                    {snapshot.score.approvedSightings}/{snapshot.score.totalSightings}
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Derived from approved wildlife sightings (field-team records are approved
              automatically; citizen-scientist records after review).
            </p>
          </div>

          {/* ── Featured wildlife photos ── */}
          {snapshot.featuredPhotos.length > 0 && (
            <div>
              <h4 className="mb-3 text-sm font-semibold text-foreground">
                Featured wildlife photos
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {snapshot.featuredPhotos.map((sighting) => (
                  <figure
                    key={sighting.id}
                    className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sighting.photoUrl}
                      alt={`${sighting.speciesCommonName} sighting at the project site`}
                      className="h-44 w-full object-cover"
                      loading="lazy"
                    />
                    <figcaption className="space-y-1 p-3">
                      <p className="text-sm font-semibold text-foreground">
                        {sighting.speciesCommonName}
                      </p>
                      {sighting.scientificName && (
                        <p className="text-xs italic text-muted-foreground">
                          {sighting.scientificName}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {sighting.count} observed · {formatDate(sighting.observedAt)} · by{' '}
                        {sighting.submittedBy}
                      </p>
                      <span className="inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        {sighting.submitterRole === 'field_team'
                          ? 'Field team'
                          : 'Citizen scientist'}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          {/* ── Recent approved sightings ── */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-foreground">Recent sightings</h4>
            {snapshot.recentApproved.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No approved wildlife sightings recorded yet for this project.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {snapshot.recentApproved.map((sighting) => (
                  <li
                    key={sighting.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Ruler className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <span className="font-medium text-foreground">
                        {sighting.speciesCommonName}
                      </span>
                      <span className="text-muted-foreground">
                        · {groupLabel(sighting.taxonomicGroup)} · {sighting.count} observed
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(sighting.observedAt)} ·{' '}
                      {sighting.submitterRole === 'field_team' ? 'Field team' : 'Citizen scientist'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
