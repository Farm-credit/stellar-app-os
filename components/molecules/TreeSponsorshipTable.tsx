// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  DollarSign,
  ExternalLink,
  Leaf,
  MapPin,
  ShieldCheck,
  Wind,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  SPONSORSHIP_METRICS,
  formatSponsorshipMetric,
  type SponsorshipMetricId,
  type SortDirection,
  type TreeSponsorshipOffering,
} from '@/lib/treeSponsorshipComparison';

export interface TreeSponsorshipTableProps {
  /** The selected projects to compare (up to 4 simultaneously) */
  offerings: TreeSponsorshipOffering[];
  /** Currently active sorting metric */
  activeSortMetric?: SponsorshipMetricId;
  /** Active sort direction ('asc' | 'desc') */
  sortDirection?: SortDirection;
  /** Callback fired when a sponsor clicks to sort by a metric */
  onSortChange?: (metric: SponsorshipMetricId, direction: SortDirection) => void;
  /** Optional callback to remove a project from comparison directly from its column */
  onRemoveProject?: (projectId: string) => void;
  /** Optional container class name */
  className?: string;
}

const METRIC_ICONS: Record<SponsorshipMetricId, LucideIcon> = {
  cost: DollarSign,
  species: Leaf,
  co2: Wind,
  survivalRate: ShieldCheck,
  location: MapPin,
};

export function TreeSponsorshipTable({
  offerings,
  activeSortMetric = 'cost',
  sortDirection = 'asc',
  onSortChange,
  onRemoveProject,
  className,
}: TreeSponsorshipTableProps) {
  if (offerings.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-xl bg-card/40 p-8">
        <p className="text-muted-foreground text-sm">
          No projects selected. Choose up to 4 projects above to compare their tree sponsorship
          offerings.
        </p>
      </div>
    );
  }

  const handleMetricSortClick = (metricId: SponsorshipMetricId) => {
    if (!onSortChange) return;
    if (activeSortMetric === metricId) {
      // Toggle direction
      onSortChange(metricId, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Default to ascending for cost, species, location; descending for co2, survival rate
      const defaultDesc = metricId === 'survivalRate' || metricId === 'co2';
      onSortChange(metricId, defaultDesc ? 'desc' : 'asc');
    }
  };

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden',
        className
      )}
      data-testid="tree-sponsorship-table-container"
    >
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-sm min-w-[700px]"
          data-testid="tree-sponsorship-table"
        >
          <caption className="sr-only">
            Structured comparison table of tree sponsorship offerings across up to four projects
            simultaneously.
          </caption>

          {/* Table Header: Project Columns with links to full project pages */}
          <thead className="bg-muted/60 border-b border-border">
            <tr>
              {/* Top-left metric column label */}
              <th
                scope="col"
                className="p-4 text-left font-semibold text-muted-foreground w-56 sticky left-0 bg-muted/90 backdrop-blur z-20 border-r border-border/60"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wider font-bold text-foreground">
                    Metrics / Offering
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">
                    Click row header to sort
                  </span>
                </div>
              </th>

              {/* Each Project Column */}
              {offerings.map((offering) => {
                const projectHref = `/projects/${offering.projectId || offering.id}`;

                return (
                  <th
                    key={offering.id}
                    scope="col"
                    className="p-4 text-left align-top font-semibold min-w-[210px] max-w-[280px] border-r border-border/40 last:border-r-0 relative group"
                    data-testid={`project-column-${offering.id}`}
                  >
                    <div className="flex flex-col h-full justify-between gap-3">
                      <div className="flex items-start justify-between gap-2">
                        {/* Link to full project page from column header */}
                        <Link
                          href={projectHref}
                          className="font-bold text-base text-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 group-hover:underline"
                          title={`View full project page for ${offering.projectName}`}
                          aria-label={`View full project page for ${offering.projectName}`}
                        >
                          <span>{offering.projectName}</span>
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
                        </Link>

                        {onRemoveProject && (
                          <button
                            type="button"
                            onClick={() => onRemoveProject(offering.id)}
                            className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title={`Remove ${offering.projectName} from comparison`}
                            aria-label={`Remove ${offering.projectName} from comparison`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs font-normal">
                          {offering.projectType}
                        </Badge>
                        {offering.country && (
                          <span className="text-xs text-muted-foreground">{offering.country}</span>
                        )}
                      </div>

                      {/* Direct button link to full project page in column header */}
                      <Link
                        href={projectHref}
                        className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 mt-1"
                        aria-label={`Open project details for ${offering.projectName}`}
                      >
                        Project Details ↗
                      </Link>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body: 5 Structured Metrics */}
          <tbody className="divide-y divide-border/60">
            {SPONSORSHIP_METRICS.map((metric, idx) => {
              const MetricIcon = METRIC_ICONS[metric.id];
              const isActiveSort = activeSortMetric === metric.id;
              const isEven = idx % 2 === 0;

              return (
                <tr
                  key={metric.id}
                  className={cn(
                    'transition-colors hover:bg-muted/40',
                    isEven ? 'bg-background' : 'bg-muted/20',
                    isActiveSort && 'bg-primary/5'
                  )}
                  data-testid={`metric-row-${metric.id}`}
                >
                  {/* Metric Label Row Header with Interactive Sort Trigger */}
                  <th
                    scope="row"
                    className="p-4 text-left font-medium sticky left-0 bg-inherit backdrop-blur z-10 border-r border-border/60"
                  >
                    <button
                      type="button"
                      onClick={() => handleMetricSortClick(metric.id)}
                      className={cn(
                        'w-full text-left flex items-center justify-between gap-2 p-1.5 -m-1.5 rounded-lg transition-colors cursor-pointer',
                        'hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        isActiveSort && 'font-bold text-primary'
                      )}
                      aria-label={`Sort table by ${metric.label} (${
                        isActiveSort && sortDirection === 'asc'
                          ? 'currently ascending'
                          : 'currently descending'
                      })`}
                      title={`Sort table columns by ${metric.label}`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'p-1.5 rounded-md text-muted-foreground bg-muted',
                            isActiveSort && 'bg-primary/20 text-primary'
                          )}
                        >
                          <MetricIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm leading-tight">{metric.label}</div>
                          {metric.unit && (
                            <span className="text-[11px] text-muted-foreground font-normal">
                              ({metric.unit})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Sort indicator icon */}
                      <span className="shrink-0 text-muted-foreground p-1">
                        {isActiveSort ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp
                              className="w-4 h-4 text-primary font-bold animate-in fade-in"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowDown
                              className="w-4 h-4 text-primary font-bold animate-in fade-in"
                              aria-hidden="true"
                            />
                          )
                        ) : (
                          <ArrowUpDown
                            className="w-3.5 h-3.5 opacity-40 hover:opacity-100"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* Project Metric Cells across Columns */}
                  {offerings.map((offering) => (
                    <td
                      key={`${offering.id}-${metric.id}`}
                      className={cn(
                        'p-4 align-middle border-r border-border/40 last:border-r-0',
                        isActiveSort && 'bg-primary/5 font-medium'
                      )}
                      data-testid={`cell-${offering.id}-${metric.id}`}
                    >
                      {renderMetricCell(offering, metric.id)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>

          {/* Table Footer: Column Action Links to Full Project Pages */}
          <tfoot className="bg-muted/40 border-t border-border">
            <tr>
              <th
                scope="row"
                className="p-4 text-left font-semibold text-muted-foreground sticky left-0 bg-muted/70 backdrop-blur z-10 border-r border-border/60"
              >
                Project Navigation
              </th>
              {offerings.map((offering) => {
                const projectHref = `/projects/${offering.projectId || offering.id}`;

                return (
                  <td
                    key={`nav-${offering.id}`}
                    className="p-4 border-r border-border/40 last:border-r-0"
                  >
                    <Link
                      href={projectHref}
                      className="inline-flex w-full items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-xs"
                      aria-label={`Go to full project page for ${offering.projectName}`}
                    >
                      <span>View Full Project Page</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </Link>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function renderMetricCell(offering: TreeSponsorshipOffering, metricId: SponsorshipMetricId) {
  switch (metricId) {
    case 'cost':
      return (
        <div className="flex flex-col">
          <span className="text-base font-bold text-foreground">
            {formatSponsorshipMetric(offering, 'cost')}
          </span>
          <span className="text-xs text-muted-foreground">per sponsored tree</span>
        </div>
      );

    case 'species':
      return (
        <div className="flex flex-col gap-1.5">
          <Badge
            variant="outline"
            className="border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/50 text-xs py-1 px-2.5 inline-flex items-center gap-1.5 w-fit"
          >
            <Leaf className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-semibold">{offering.species}</span>
          </Badge>
          {offering.secondarySpecies && offering.secondarySpecies.length > 0 && (
            <p className="text-[11px] text-muted-foreground line-clamp-1">
              +{offering.secondarySpecies.join(', ')}
            </p>
          )}
        </div>
      );

    case 'co2':
      return (
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold text-foreground">{offering.co2}</span>
          <span className="text-xs text-muted-foreground">{offering.co2Unit}</span>
        </div>
      );

    case 'survivalRate':
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-foreground">{offering.survivalRate}%</span>
            <span
              className={cn(
                'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full',
                offering.survivalRate >= 90
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : offering.survivalRate >= 80
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              )}
            >
              Verified
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                offering.survivalRate >= 90
                  ? 'bg-emerald-500'
                  : offering.survivalRate >= 80
                    ? 'bg-blue-500'
                    : 'bg-amber-500'
              )}
              style={{ width: `${Math.min(offering.survivalRate, 100)}%` }}
            />
          </div>
        </div>
      );

    case 'location':
      return (
        <div className="flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <span className="text-xs text-foreground font-medium leading-relaxed">
            {offering.location}
          </span>
        </div>
      );
  }
}

export default TreeSponsorshipTable;
