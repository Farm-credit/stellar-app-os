// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Project Comparison Tool — side-by-side review
 * Issue #1354: compare offset projects on price, co-benefits, methodology,
 * verifier, risk rating and buyer reviews.
 *
 * Data and formatting come from `@/lib/projectComparison`; the URL contract and
 * CSV export come from `@/lib/comparisonExport`.  The selection is mirrored
 * into `?ids=…&cols=…`, which is the same format `GET /api/comparison/export`
 * hands out, so a shared link reopens the exact comparison.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Columns,
  DollarSign,
  Download,
  Droplet,
  Filter,
  Leaf,
  Link2,
  MapPin,
  Scale,
  Search,
  Shield,
  Sprout,
  Star,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  COMPARISON_CRITERIA,
  DEFAULT_COMPARISON_CRITERIA,
  MAX_COMPARE_PROJECTS,
  MIN_COMPARE_PROJECTS,
  describeCriterionValue,
  formatCredits,
  formatPrice,
  getAverageRating,
  getCoBenefitColor,
  getCoBenefitIconName,
  getCoBenefitLabel,
  getAllProjects,
  getComparisonProjects,
  getProjects,
  getRiskBadgeColor,
  getRiskColor,
  getRiskIconName,
  normalizeComparisonCriteria,
  normalizeProjectIds,
  type CoBenefitIconName,
  type ComparisonCriteria,
  type ComparisonCriterionId,
  type CriterionCell,
  type Project,
  type ProjectComparisonFilters,
  type ProjectCurrency,
  type RiskIconName,
  type RiskRating,
  type SortDirection,
} from '@/lib/projectComparison';
import {
  buildComparisonSearch,
  buildComparisonUrl,
  comparisonFileName,
  downloadFile,
  toComparisonCsv,
} from '@/lib/comparisonExport';

const ALL = 'all';

const RISK_ICONS: Record<RiskIconName, LucideIcon> = {
  check: Check,
  alert: AlertCircle,
  cross: X,
};

const CO_BENEFIT_ICONS: Record<CoBenefitIconName, LucideIcon> = {
  leaf: Leaf,
  users: Users,
  droplet: Droplet,
  sprout: Sprout,
  shield: Shield,
  scale: Scale,
};

const RISK_OPTIONS: RiskRating[] = ['low', 'medium', 'high'];

export interface ProjectComparisonToolProps {
  /** Preselected projects, typically from `?ids=` on the comparison page. */
  initialProjectIds?: string[];
  /** Visible columns, typically from `?cols=`. */
  initialCriteria?: ComparisonCriterionId[];
}

interface FilterState {
  search: string;
  projectType: string;
  country: string;
  minPrice: string;
  maxPrice: string;
  riskRating: string;
  verifier: string;
}

const EMPTY_FILTERS: FilterState = {
  search: '',
  projectType: ALL,
  country: ALL,
  minPrice: '',
  maxPrice: '',
  riskRating: ALL,
  verifier: ALL,
};

export function ProjectComparisonTool({
  initialProjectIds = [],
  initialCriteria,
}: ProjectComparisonToolProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    normalizeProjectIds(initialProjectIds)
  );
  const [visibleCriteria, setVisibleCriteria] = useState<ComparisonCriterionId[]>(() => {
    const requested = normalizeComparisonCriteria((initialCriteria ?? []).map(String));
    return requested.length > 0 ? requested : [...DEFAULT_COMPARISON_CRITERIA];
  });
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sortId, setSortId] = useState<ComparisonCriterionId>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [tab, setTab] = useState<'browse' | 'compare'>(
    normalizeProjectIds(initialProjectIds).length >= MIN_COMPARE_PROJECTS ? 'compare' : 'browse'
  );
  const [notice, setNotice] = useState<string | null>(null);

  const allProjects = useMemo(() => getAllProjects(), []);

  const queryFilters = useMemo<ProjectComparisonFilters>(
    () => ({
      search: filters.search,
      projectType: filters.projectType === ALL ? undefined : filters.projectType,
      country: filters.country === ALL ? undefined : filters.country,
      verifier: filters.verifier === ALL ? undefined : filters.verifier,
      riskRating: filters.riskRating === ALL ? undefined : (filters.riskRating as RiskRating),
      minPrice: filters.minPrice.trim() === '' ? undefined : Number(filters.minPrice),
      maxPrice: filters.maxPrice.trim() === '' ? undefined : Number(filters.maxPrice),
    }),
    [filters]
  );

  const filteredProjects = useMemo(
    () => getProjects(queryFilters, { id: sortId, direction: sortDirection }),
    [queryFilters, sortId, sortDirection]
  );

  const comparisonProjects = useMemo(() => getComparisonProjects(selectedIds), [selectedIds]);

  const countries = useMemo(
    () => [...new Set(allProjects.map((project) => project.country))].sort(),
    [allProjects]
  );
  const verifiers = useMemo(
    () => [...new Set(allProjects.map((project) => project.verifier))].sort(),
    [allProjects]
  );
  const projectTypes = useMemo(
    () => [...new Set(allProjects.map((project) => project.projectType))].sort(),
    [allProjects]
  );

  // Keep the address bar in sync so the page can be bookmarked/shared as-is.
  useEffect(() => {
    const search = buildComparisonSearch({ ids: selectedIds, criteria: visibleCriteria });
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
  }, [selectedIds, visibleCriteria]);

  const toggleProject = useCallback(
    (id: string) => {
      setSelectedIds((previous) => {
        if (previous.includes(id)) {
          setNotice(null);
          return previous.filter((selected) => selected !== id);
        }
        if (previous.length >= MAX_COMPARE_PROJECTS) {
          setNotice(`You can compare up to ${MAX_COMPARE_PROJECTS} projects at a time.`);
          return previous;
        }
        setNotice(null);
        return [...previous, id];
      });
    },
    []
  );

  const toggleCriterion = useCallback((id: ComparisonCriterionId, visible: boolean) => {
    setVisibleCriteria((previous) => {
      if (visible) {
        return COMPARISON_CRITERIA.filter(
          (criterion) => previous.includes(criterion.id) || criterion.id === id
        ).map((criterion) => criterion.id);
      }
      return previous.filter((criterion) => criterion !== id);
    });
  }, []);

  const handleExportCsv = useCallback(() => {
    if (comparisonProjects.length < MIN_COMPARE_PROJECTS) {
      setNotice(`Select at least ${MIN_COMPARE_PROJECTS} projects to export a comparison.`);
      return;
    }
    downloadFile(
      toComparisonCsv(comparisonProjects, visibleCriteria),
      comparisonFileName(selectedIds),
      'text/csv;charset=utf-8'
    );
    setNotice(`Exported ${comparisonProjects.length} projects to CSV.`);
  }, [comparisonProjects, selectedIds, visibleCriteria]);

  const handleCopyLink = useCallback(async () => {
    const url = buildComparisonUrl({ ids: selectedIds, criteria: visibleCriteria });
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setNotice(url);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Shareable comparison link copied to your clipboard.');
    } catch {
      setNotice(url);
    }
  }, [selectedIds, visibleCriteria]);

  const atSelectionLimit = selectedIds.length >= MAX_COMPARE_PROJECTS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Project Comparison Tool</h1>
          <p className="text-muted-foreground">
            Compare carbon offset projects side-by-side: price, co-benefits, methodology, verifier,
            risk rating and buyer reviews.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" aria-live="polite">
            {selectedIds.length}/{MAX_COMPARE_PROJECTS} selected
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={comparisonProjects.length < MIN_COMPARE_PROJECTS}
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            disabled={comparisonProjects.length < MIN_COMPARE_PROJECTS}
          >
            <Link2 className="w-4 h-4" aria-hidden="true" />
            Copy link
          </Button>
        </div>
      </div>

      {notice && (
        <p
          role="status"
          className="text-sm rounded-md border bg-muted/50 px-3 py-2 break-words"
        >
          {notice}
        </p>
      )}

      {/* Filters */}
      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                placeholder="Search projects, locations, methodologies…"
                aria-label="Search projects"
                value={filters.search}
                onChange={(event) =>
                  setFilters((previous) => ({ ...previous, search: event.target.value }))
                }
                className="pl-10"
              />
            </div>
            <Select
              value={filters.projectType}
              onValueChange={(value: string) =>
                setFilters((previous) => ({ ...previous, projectType: value }))
              }
            >
              <SelectTrigger className="w-[170px]" aria-label="Filter by project type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {projectTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.country}
              onValueChange={(value: string) =>
                setFilters((previous) => ({ ...previous, country: value }))
              }
            >
              <SelectTrigger className="w-[160px]" aria-label="Filter by country">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All countries</SelectItem>
                {countries.map((country) => (
                  <SelectItem key={country} value={country}>
                    {country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.verifier}
              onValueChange={(value: string) =>
                setFilters((previous) => ({ ...previous, verifier: value }))
              }
            >
              <SelectTrigger className="w-[170px]" aria-label="Filter by verifier">
                <SelectValue placeholder="Verifier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All verifiers</SelectItem>
                {verifiers.map((verifier) => (
                  <SelectItem key={verifier} value={verifier}>
                    {verifier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.riskRating}
              onValueChange={(value: string) =>
                setFilters((previous) => ({ ...previous, riskRating: value }))
              }
            >
              <SelectTrigger className="w-[140px]" aria-label="Filter by risk rating">
                <SelectValue placeholder="Risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All risks</SelectItem>
                {RISK_OPTIONS.map((risk) => (
                  <SelectItem key={risk} value={risk}>
                    {risk}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="Min $/ton"
                aria-label="Minimum price per ton"
                value={filters.minPrice}
                onChange={(event) =>
                  setFilters((previous) => ({ ...previous, minPrice: event.target.value }))
                }
                className="w-[120px]"
              />
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="Max $/ton"
                aria-label="Maximum price per ton"
                value={filters.maxPrice}
                onChange={(event) =>
                  setFilters((previous) => ({ ...previous, maxPrice: event.target.value }))
                }
                className="w-[120px]"
              />
            </div>
            <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
              <Filter className="w-4 h-4" aria-hidden="true" />
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Column visibility */}
      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Visible columns:</span>
            {COMPARISON_CRITERIA.map((criterion) => (
              <label
                key={criterion.id}
                className="inline-flex items-center gap-1.5 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  className="rounded border-input"
                  checked={visibleCriteria.includes(criterion.id)}
                  onChange={(event) => toggleCriterion(criterion.id, event.target.checked)}
                />
                {criterion.label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={tab}
        onValueChange={(value: string) => setTab(value === 'compare' ? 'compare' : 'browse')}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="compare" disabled={selectedIds.length < MIN_COMPARE_PROJECTS}>
            <Columns className="w-4 h-4 mr-2" aria-hidden="true" />
            Compare ({selectedIds.length})
          </TabsTrigger>
          <TabsTrigger value="browse">
            <Search className="w-4 h-4 mr-2" aria-hidden="true" />
            Browse ({filteredProjects.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compare">
          {comparisonProjects.length < MIN_COMPARE_PROJECTS ? (
            <div className="text-center py-12 border border-dashed rounded-lg">
              <Columns className="w-12 h-12 mx-auto text-muted-foreground mb-4" aria-hidden="true" />
              <h2 className="text-lg font-medium">Select projects to compare</h2>
              <p className="text-muted-foreground mt-1">
                Choose at least {MIN_COMPARE_PROJECTS} projects from the Browse tab to compare them
                side-by-side.
              </p>
            </div>
          ) : (
            <ComparisonTable projects={comparisonProjects} visibleCriteria={visibleCriteria} />
          )}
        </TabsContent>

        <TabsContent value="browse">
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <span className="text-sm text-muted-foreground">
              {filteredProjects.length} project{filteredProjects.length === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <Select
                value={sortId}
                onValueChange={(value: string) => setSortId(value as ComparisonCriterionId)}
              >
                <SelectTrigger className="w-[190px]" aria-label="Sort projects by">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {COMPARISON_CRITERIA.filter((criterion) => criterion.sortable).map(
                    (criterion) => (
                      <SelectItem key={criterion.id} value={criterion.id}>
                        {criterion.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
                onClick={() =>
                  setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'))
                }
              >
                {sortDirection === 'asc' ? (
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="text-center py-12 border border-dashed rounded-lg">
              <p className="text-muted-foreground">No projects match these filters.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  selected={selectedIds.includes(project.id)}
                  disabled={atSelectionLimit && !selectedIds.includes(project.id)}
                  onToggle={() => toggleProject(project.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Comparison table ──────────────────────────────────────────────────────────

function ComparisonTable({
  projects,
  visibleCriteria,
}: {
  projects: Project[];
  visibleCriteria: ComparisonCriterionId[];
}) {
  const activeCriteria = useMemo(
    () => COMPARISON_CRITERIA.filter((criterion) => visibleCriteria.includes(criterion.id)),
    [visibleCriteria]
  );

  return (
    <div className="rounded-lg border overflow-hidden">
      <ScrollArea className="max-h-[70vh]">
        <table className="w-full min-w-[800px] text-sm">
          <caption className="sr-only">
            Side-by-side comparison of {projects.length} carbon offset projects
          </caption>
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium w-48">
                Criteria
              </th>
              {projects.map((project) => (
                <th key={project.id} scope="col" className="px-4 py-3 text-center font-medium">
                  {project.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeCriteria.map((criterion) => (
              <tr key={criterion.id} className="border-t">
                <th
                  scope="row"
                  className="px-4 py-3 text-left font-medium sticky left-0 bg-background z-10 w-48"
                >
                  {criterion.label}
                </th>
                {projects.map((project) => (
                  <td key={project.id} className="px-4 py-3 text-center align-middle">
                    <ComparisonCell project={project} criterion={criterion} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

function ComparisonCell({
  project,
  criterion,
}: {
  project: Project;
  criterion: ComparisonCriteria;
}) {
  const cell: CriterionCell = describeCriterionValue(project, criterion.id);

  switch (cell.kind) {
    case 'price':
      return <span className="font-medium">{formatPrice(cell.amount, cell.currency)}</span>;
    case 'risk': {
      const RiskIcon = RISK_ICONS[getRiskIconName(cell.rating)];
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
            getRiskColor(cell.rating)
          )}
        >
          <RiskIcon className="w-3 h-3" aria-hidden="true" />
          {cell.rating}
        </span>
      );
    }
    case 'tags':
      return (
        <div className="flex flex-wrap gap-1 justify-center">
          {cell.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {cell.tags.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{cell.tags.length - 3}
            </Badge>
          )}
        </div>
      );
    case 'benefits':
      return (
        <div className="flex flex-wrap gap-1 justify-center">
          {cell.benefits.slice(0, 4).map((benefit) => {
            const BenefitIcon = CO_BENEFIT_ICONS[getCoBenefitIconName(benefit.category)];
            return (
              <span
                key={`${benefit.category}-${benefit.description}`}
                title={`${getCoBenefitLabel(benefit.category)}: ${benefit.description}${
                  benefit.verified ? ' (verified)' : ''
                }`}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded text-xs',
                  getCoBenefitColor(benefit.category)
                )}
              >
                <BenefitIcon className="w-3 h-3" aria-hidden="true" />
                <span className="sr-only">{getCoBenefitLabel(benefit.category)}</span>
              </span>
            );
          })}
          {cell.benefits.length > 4 && (
            <span className="text-xs text-muted-foreground">+{cell.benefits.length - 4}</span>
          )}
        </div>
      );
    case 'reviews':
      return (
        <span className="inline-flex items-center justify-center gap-1">
          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" aria-hidden="true" />
          {cell.count === 0 ? '—' : cell.average.toFixed(1)}
          <span className="text-xs text-muted-foreground">
            ({cell.count} review{cell.count === 1 ? '' : 's'})
          </span>
        </span>
      );
    case 'credits':
      return (
        <span className="font-medium">
          {cell.total > 0
            ? `${formatCredits(cell.available)} / ${formatCredits(cell.total)}`
            : formatCredits(cell.available)}
        </span>
      );
    case 'text':
      return <span>{cell.text}</span>;
  }
}

// ── Browse card ───────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  selected,
  disabled,
  onToggle,
}: {
  project: Project;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Card
      className={cn(
        'relative h-full transition-all',
        selected && 'ring-2 ring-primary',
        disabled && 'opacity-50'
      )}
    >
      {selected && (
        <Badge className="absolute top-3 right-3 z-10">
          <Check className="w-3 h-3" aria-hidden="true" />
          Selected
        </Badge>
      )}
      <CardContent className="p-4 h-full flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 rounded border-input"
            checked={selected}
            disabled={disabled}
            onChange={onToggle}
            aria-label={`${selected ? 'Remove' : 'Add'} ${project.name} ${
              selected ? 'from' : 'to'
            } the comparison`}
          />
          <div>
            <h3 className="font-semibold leading-tight">{project.name}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              {project.location}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{project.projectType}</Badge>
          <Badge variant="outline" className={getRiskBadgeColor(project.riskRating)}>
            Risk: {project.riskRating}
          </Badge>
          {project.isOutOfStock && <Badge variant="destructive">Out of stock</Badge>}
        </div>

        <dl className="text-sm space-y-1 text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Leaf className="w-3 h-3 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Methodology</dt>
            <dd className="truncate">{project.methodology}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="w-3 h-3 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Verifier</dt>
            <dd className="truncate">{project.verifier}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Star className="w-3 h-3 shrink-0" aria-hidden="true" />
            <dt className="sr-only">Buyer reviews</dt>
            <dd>
              {project.buyerReviews.length === 0
                ? 'No reviews yet'
                : `${getAverageRating(project.buyerReviews).toFixed(1)} from ${
                    project.buyerReviews.length
                  } review${project.buyerReviews.length === 1 ? '' : 's'}`}
            </dd>
          </div>
        </dl>

        <div className="flex items-center justify-between mt-auto pt-3 border-t">
          <span className="inline-flex items-center gap-1 font-semibold">
            <DollarSign className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            {formatPrice(project.pricePerTon, project.currency as ProjectCurrency)}/t
          </span>
          <Button variant={selected ? 'secondary' : 'default'} size="sm" onClick={onToggle}>
            {selected ? 'Remove' : 'Add to compare'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ProjectComparisonTool;
