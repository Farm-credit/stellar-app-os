'use client';

import { useState, useMemo, useCallback, type JSX } from 'react';
import type { CarbonProject, ProjectType } from '@/lib/types/carbon';
import { OffsetProjectMapClient } from './OffsetProjectMapClient';
import type { OffsetProjectMapFilters } from './OffsetProjectMap';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OffsetProjectMapPanelProps {
  projects: CarbonProject[];
  /** Optional additional className for the outer wrapper */
  className?: string;
}

// ─── Colour legend ────────────────────────────────────────────────────────────

const TYPE_LEGEND: { type: ProjectType; colour: string }[] = [
  { type: 'Reforestation', colour: '#00B36B' },
  { type: 'Renewable Energy', colour: '#14B6E7' },
  { type: 'Mangrove Restoration', colour: '#3E1BDB' },
  { type: 'Sustainable Agriculture', colour: '#f59e0b' },
  { type: 'Other', colour: '#94a3b8' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function OffsetProjectMapPanel({
  projects,
  className,
}: OffsetProjectMapPanelProps): JSX.Element {
  // Derive unique values from the supplied project list
  const allTypes = useMemo(
    () => [...new Set(projects.map((p) => p.type))] as ProjectType[],
    [projects]
  );
  const allRegions = useMemo(() => [...new Set(projects.map((p) => p.location))], [projects]);

  const [filters, setFilters] = useState<OffsetProjectMapFilters>({
    types: [],
    regions: [],
    availableOnly: false,
  });

  const visibleCount = useMemo(() => {
    return projects.filter((p) => {
      if (filters.types.length > 0 && !filters.types.includes(p.type)) return false;
      if (filters.regions.length > 0 && !filters.regions.includes(p.location)) return false;
      if (filters.availableOnly && p.isOutOfStock) return false;
      return true;
    }).length;
  }, [projects, filters]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const toggleType = useCallback((type: ProjectType) => {
    setFilters((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type],
    }));
  }, []);

  const toggleRegion = useCallback((region: string) => {
    setFilters((prev) => ({
      ...prev,
      regions: prev.regions.includes(region)
        ? prev.regions.filter((r) => r !== region)
        : [...prev.regions, region],
    }));
  }, []);

  const toggleAvailableOnly = useCallback(() => {
    setFilters((prev) => ({ ...prev, availableOnly: !prev.availableOnly }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ types: [], regions: [], availableOnly: false });
  }, []);

  const hasActiveFilters =
    filters.types.length > 0 || filters.regions.length > 0 || filters.availableOnly;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section
      className={`flex flex-col gap-4 ${className ?? ''}`}
      aria-label="Carbon offset projects geographic map"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Offset Projects Map</h2>
          <p className="text-sm text-muted-foreground">
            {visibleCount} of {projects.length} projects shown
          </p>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground sm:self-auto"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-3">
        {/* Project type chips */}
        <fieldset className="contents">
          <legend className="sr-only">Filter by project type</legend>
          {allTypes.map((type) => {
            const isActive = filters.types.includes(type);
            const colour = TYPE_LEGEND.find((l) => l.type === type)?.colour ?? '#94a3b8';
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-transparent text-white'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
                style={isActive ? { backgroundColor: colour, borderColor: colour } : undefined}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: colour }}
                  aria-hidden="true"
                />
                {type}
              </button>
            );
          })}
        </fieldset>

        {/* Divider */}
        <div className="hidden h-auto w-px bg-border sm:block" aria-hidden="true" />

        {/* Region chips */}
        <fieldset className="contents">
          <legend className="sr-only">Filter by region</legend>
          {allRegions.map((region) => {
            const isActive = filters.regions.includes(region);
            return (
              <button
                key={region}
                type="button"
                onClick={() => toggleRegion(region)}
                aria-pressed={isActive}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-stellar-blue bg-stellar-blue text-white'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                📍 {region}
              </button>
            );
          })}
        </fieldset>

        {/* Divider */}
        <div className="hidden h-auto w-px bg-border sm:block" aria-hidden="true" />

        {/* Availability toggle */}
        <button
          type="button"
          onClick={toggleAvailableOnly}
          aria-pressed={filters.availableOnly}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            filters.availableOnly
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-border bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          ✅ Available only
        </button>
      </div>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border border-stellar-blue/20 bg-muted/30">
        <div className="h-[420px] sm:h-[520px]">
          <OffsetProjectMapClient projects={projects} filters={filters} />
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {TYPE_LEGEND.filter((l) => allTypes.includes(l.type as ProjectType)).map((l) => (
          <span key={l.type} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: l.colour }}
              aria-hidden="true"
            />
            {l.type}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: '#94a3b8', opacity: 0.4 }}
            aria-hidden="true"
          />
          Out of stock
        </span>
      </div>
    </section>
  );
}
