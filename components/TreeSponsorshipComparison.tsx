// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpDown,
  Check,
  Columns,
  ExternalLink,
  Info,
  LayoutGrid,
  Leaf,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TreeSponsorshipTable } from '@/components/molecules/TreeSponsorshipTable';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SPONSORSHIP_COMPARE_IDS,
  MAX_COMPARE_PROJECTS,
  SPONSORSHIP_METRICS,
  formatSponsorshipMetric,
  getAllTreeSponsorshipOfferings,
  normalizeSponsorshipProjectIds,
  sortSponsorshipOfferings,
  type SponsorshipMetricId,
  type SortDirection,
  type TreeSponsorshipOffering,
} from '@/lib/treeSponsorshipComparison';

export interface TreeSponsorshipComparisonProps {
  /** Optional initial project IDs to compare (capped at 4) */
  initialProjectIds?: string[];
  /** Optional initial sort metric */
  initialSortMetric?: SponsorshipMetricId;
  /** Optional initial sort direction */
  initialSortDirection?: SortDirection;
  /** Optional container class name */
  className?: string;
}

export function TreeSponsorshipComparison({
  initialProjectIds = [...DEFAULT_SPONSORSHIP_COMPARE_IDS],
  initialSortMetric = 'cost',
  initialSortDirection = 'asc',
  className,
}: TreeSponsorshipComparisonProps) {
  const allOfferings = useMemo(() => getAllTreeSponsorshipOfferings(), []);

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    normalizeSponsorshipProjectIds(initialProjectIds)
  );
  const [activeSortMetric, setActiveSortMetric] = useState<SponsorshipMetricId>(initialSortMetric);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection);
  const [searchQuery, setSearchQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'table'>('side-by-side');

  // Toggle selection of a project
  const toggleProject = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        setNotice(null);
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= MAX_COMPARE_PROJECTS) {
        setNotice(`You can compare up to ${MAX_COMPARE_PROJECTS} projects simultaneously.`);
        return prev;
      }
      setNotice(null);
      return [...prev, id];
    });
  }, []);

  const handleRemoveProject = useCallback((id: string) => {
    setSelectedIds((prev) => prev.filter((item) => item !== id));
    setNotice(null);
  }, []);

  const handleClearAll = useCallback(() => {
    setSelectedIds([]);
    setNotice('Selection cleared. Choose up to 4 projects to compare.');
  }, []);

  const handleSelectDefault = useCallback(() => {
    setSelectedIds([...DEFAULT_SPONSORSHIP_COMPARE_IDS]);
    setNotice(null);
  }, []);

  // Filter available offerings in the picker by search query
  const filteredAvailableOfferings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allOfferings;

    return allOfferings.filter((offering) => {
      const haystack =
        `${offering.projectName} ${offering.species} ${offering.location} ${offering.country}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [allOfferings, searchQuery]);

  // Selected offerings resolved from selected IDs
  const rawSelectedOfferings = useMemo(() => {
    return selectedIds
      .map((id) => allOfferings.find((o) => o.id === id))
      .filter((o): o is TreeSponsorshipOffering => Boolean(o));
  }, [selectedIds, allOfferings]);

  // Sort the selected offerings according to active metric and direction
  const sortedSelectedOfferings = useMemo(() => {
    return sortSponsorshipOfferings(rawSelectedOfferings, activeSortMetric, sortDirection);
  }, [rawSelectedOfferings, activeSortMetric, sortDirection]);

  const handleSortChange = useCallback((metric: SponsorshipMetricId, direction: SortDirection) => {
    setActiveSortMetric(metric);
    setSortDirection(direction);
  }, []);

  const isAtLimit = selectedIds.length >= MAX_COMPARE_PROJECTS;

  return (
    <div className={cn('space-y-6', className)} data-testid="tree-sponsorship-comparison">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="inline-flex items-center gap-2 mb-1.5">
            <span className="p-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <Leaf className="w-4 h-4" />
            </span>
            <span className="text-xs uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400">
              Sponsor Comparison
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Tree Sponsorship Offering Comparison
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Compare tree sponsorship offerings side-by-side across verified projects by cost,
            species, carbon sequestration, survival rate, and planting location.
          </p>
        </div>

        {/* Status badges & Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={isAtLimit ? 'default' : 'secondary'}
            className="text-xs px-3 py-1 font-semibold"
            aria-live="polite"
            data-testid="selection-counter"
          >
            {selectedIds.length} / {MAX_COMPARE_PROJECTS} selected
          </Badge>

          {selectedIds.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="text-xs"
              aria-label="Clear all selections"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Clear Selection
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectDefault}
              className="text-xs"
              aria-label="Load preset projects"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1" />
              Compare Top 4
            </Button>
          )}

          {/* View mode toggle */}
          <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-all inline-flex items-center gap-1.5',
                viewMode === 'side-by-side'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Side-by-side comparison matrix"
              aria-label="Side-by-side comparison matrix"
            >
              <Columns className="w-3.5 h-3.5" />
              Side-by-Side
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-all inline-flex items-center gap-1.5',
                viewMode === 'table'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Detailed list comparison table"
              aria-label="Detailed list comparison table"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              List View
            </button>
          </div>
        </div>
      </div>

      {/* User Notice / Feedback Alert */}
      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 p-3 text-xs sm:text-sm rounded-xl border border-primary/20 bg-primary/5 text-foreground animate-in fade-in"
        >
          <Info className="w-4 h-4 text-primary shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Project Selector Drawer / Picker */}
      <Card className="border border-border/70 bg-card/40 backdrop-blur-sm">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <span>Select Projects to Compare</span>
                <span className="text-xs text-muted-foreground font-normal">
                  (Choose up to {MAX_COMPARE_PROJECTS} projects)
                </span>
              </h3>
            </div>

            {/* Search Input for offerings */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search projects, species, location…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8 text-xs"
                aria-label="Filter available projects"
              />
            </div>
          </div>

          {/* Project Selection Chips / Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {filteredAvailableOfferings.map((offering) => {
              const isSelected = selectedIds.includes(offering.id);
              const isDisabled = !isSelected && isAtLimit;

              return (
                <button
                  key={offering.id}
                  type="button"
                  onClick={() => toggleProject(offering.id)}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  className={cn(
                    'p-3 text-left rounded-xl border transition-all text-xs flex flex-col justify-between gap-2 cursor-pointer',
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40'
                      : 'border-border/70 bg-card hover:border-border hover:bg-muted/40',
                    isDisabled &&
                      'opacity-40 cursor-not-allowed hover:border-border/70 hover:bg-card'
                  )}
                  data-testid={`project-picker-card-${offering.id}`}
                >
                  <div className="flex items-start justify-between gap-1.5 w-full">
                    <span className="font-semibold text-foreground line-clamp-1 leading-snug">
                      {offering.projectName}
                    </span>
                    <span
                      className={cn(
                        'w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-all',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-muted-foreground/30 bg-muted/40'
                      )}
                    >
                      {isSelected ? (
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      ) : (
                        <Plus className="w-2.5 h-2.5 opacity-60" />
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground w-full">
                    <span className="truncate max-w-[120px]">{offering.species}</span>
                    <span className="font-bold text-foreground">
                      ${offering.cost.toFixed(2)}/tree
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sort Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-muted/30 p-3 rounded-xl border border-border/60">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-muted-foreground flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" />
            Sort By Metric:
          </span>
          {SPONSORSHIP_METRICS.map((metric) => {
            const isActive = activeSortMetric === metric.id;

            return (
              <Button
                key={metric.id}
                variant={isActive ? 'default' : 'outline'}
                size="xs"
                onClick={() => {
                  if (isActive) {
                    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setActiveSortMetric(metric.id);
                    setSortDirection(
                      metric.id === 'survivalRate' || metric.id === 'co2' ? 'desc' : 'asc'
                    );
                  }
                }}
                className={cn('text-xs capitalize', isActive && 'shadow-xs')}
                aria-label={`Sort by ${metric.label}`}
                data-testid={`sort-btn-${metric.id}`}
              >
                {metric.shortLabel}
                {isActive && (
                  <span className="ml-1 font-bold">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
              </Button>
            );
          })}
        </div>

        <span className="text-muted-foreground text-[11px]">
          Sorted by <strong className="text-foreground">{activeSortMetric}</strong> (
          {sortDirection === 'asc' ? 'Ascending' : 'Descending'})
        </span>
      </div>

      {/* Comparison View Rendering */}
      {selectedIds.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl bg-card/40 p-8 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Leaf className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-foreground">No Projects Selected</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Select up to 4 projects above to compare their tree sponsorship offerings side-by-side.
          </p>
          <Button variant="outline" size="sm" onClick={handleSelectDefault}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Load Sample 4 Projects
          </Button>
        </div>
      ) : viewMode === 'side-by-side' ? (
        /* Structured Side-by-Side Data Table */
        <TreeSponsorshipTable
          offerings={sortedSelectedOfferings}
          activeSortMetric={activeSortMetric}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          onRemoveProject={handleRemoveProject}
        />
      ) : (
        /* Tabular List View Alternative */
        <div className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden overflow-x-auto">
          <table
            className="w-full text-sm min-w-[700px] border-collapse"
            data-testid="tree-sponsorship-list-table"
          >
            <caption className="sr-only">List view of compared tree sponsorship offerings</caption>
            <thead className="bg-muted/60 border-b border-border">
              <tr>
                <th scope="col" className="p-4 text-left font-semibold text-muted-foreground">
                  Project
                </th>
                {SPONSORSHIP_METRICS.map((metric) => (
                  <th
                    key={metric.id}
                    scope="col"
                    className="p-4 text-left font-semibold text-muted-foreground cursor-pointer hover:text-foreground"
                    onClick={() => {
                      if (activeSortMetric === metric.id) {
                        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setActiveSortMetric(metric.id);
                        setSortDirection('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{metric.label}</span>
                      {activeSortMetric === metric.id && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                ))}
                <th scope="col" className="p-4 text-right font-semibold text-muted-foreground">
                  Project Page
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sortedSelectedOfferings.map((offering) => {
                const projectHref = `/projects/${offering.projectId || offering.id}`;

                return (
                  <tr key={offering.id} className="hover:bg-muted/40 transition-colors">
                    <td className="p-4 font-semibold">
                      <Link
                        href={projectHref}
                        className="text-foreground hover:text-primary transition-colors underline-offset-2 hover:underline inline-flex items-center gap-1"
                      >
                        {offering.projectName}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </Link>
                    </td>
                    <td className="p-4 font-bold text-foreground">
                      {formatSponsorshipMetric(offering, 'cost')}
                    </td>
                    <td className="p-4">
                      <Badge variant="outline" className="text-xs">
                        {offering.species}
                      </Badge>
                    </td>
                    <td className="p-4">{formatSponsorshipMetric(offering, 'co2')}</td>
                    <td className="p-4 font-semibold text-emerald-700 dark:text-emerald-400">
                      {offering.survivalRate}%
                    </td>
                    <td className="p-4 text-muted-foreground">{offering.location}</td>
                    <td className="p-4 text-right">
                      <Link
                        href={projectHref}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        aria-label={`View full project page for ${offering.projectName}`}
                      >
                        View Page ↗
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default TreeSponsorshipComparison;
