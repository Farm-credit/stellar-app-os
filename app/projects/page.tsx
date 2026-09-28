'use client';

import { Suspense, useState, useEffect, useMemo, useCallback, type JSX } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterSidebar } from '@/components/organisms/FilterSidebar/FilterSidebar';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import {
  parseFiltersFromUrl,
  buildFiltersUrl,
  applyFilters,
  extractUniqueValues,
} from '@/lib/utils/filterUtils';
import { createDefaultFilters } from '@/lib/types/filters';
import type { ProjectFilters } from '@/lib/types/filters';
import { ProjectCard } from '@/components/molecules/ProjectCard/ProjectCard';
import { OffsetProjectMapWrapper } from '@/components/organisms/OffsetProjectMap/OffsetProjectMapWrapper';
import Link from 'next/link';

function ProjectsContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ProjectFilters>(createDefaultFilters());
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  useEffect(() => {
    const urlFilters = parseFiltersFromUrl(searchParams);
    setSearchInput(urlFilters.search || '');
    requestAnimationFrame(() => {
      setFilters((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(urlFilters)) {
          return prev;
        }
        return urlFilters;
      });
    });
  }, [searchParams]);

  const availableTypes = useMemo(() => extractUniqueValues(mockCarbonProjects, (p) => p.type), []);

  const availableLocations = useMemo(
    () => extractUniqueValues(mockCarbonProjects, (p) => p.location),
    []
  );

  const availableCoBenefits = useMemo(
    () => extractUniqueValues(mockCarbonProjects, (p) => p.coBenefits),
    []
  );

  const availableStandards = useMemo(
    () => extractUniqueValues(mockCarbonProjects, (p) => p.verificationStatus),
    []
  );

  const priceRange = useMemo(() => {
    const prices = mockCarbonProjects.map((p) => p.pricePerTon);
    return {
      min: Math.floor(Math.min(...prices)),
      max: Math.ceil(Math.max(...prices)),
    };
  }, []);

  useEffect(() => {
    if (filters.priceRange.min === 0 && filters.priceRange.max === 100) {
      requestAnimationFrame(() => {
        setFilters((prev) => {
          if (prev.priceRange.min === priceRange.min && prev.priceRange.max === priceRange.max) {
            return prev;
          }
          return {
            ...prev,
            priceRange: {
              min: priceRange.min,
              max: priceRange.max,
            },
          };
        });
      });
    }
  }, [priceRange, filters.priceRange]);

  const filteredProjects = useMemo(() => applyFilters(mockCarbonProjects, filters), [filters]);

  const handleFiltersChange = useCallback(
    (newFilters: ProjectFilters) => {
      setFilters(newFilters);
      const params = buildFiltersUrl(newFilters);
      const newUrl = params.toString() ? `?${params.toString()}` : '/projects';
      router.push(newUrl, { scroll: false });
    },
    [router]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFiltersChange({
      ...filters,
      search: searchInput.trim(),
    });
  };

  const handleToggleCoBenefitPill = (benefit: string) => {
    const current = filters.coBenefits || [];
    const updated = current.includes(benefit)
      ? current.filter((b) => b !== benefit)
      : [...current, benefit];
    handleFiltersChange({
      ...filters,
      coBenefits: updated,
    });
  };

  const handleResetFilters = useCallback(() => {
    setSearchInput('');
    setFilters(createDefaultFilters(priceRange));
    router.push('/projects', { scroll: false });
  }, [router, priceRange]);

  const CORE_CO_BENEFITS = [
    { key: 'Biodiversity', label: '🌱 Biodiversity' },
    { key: 'Water Conservation', label: '💧 Water' },
    { key: 'Soil Health', label: '🌍 Soil' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-stellar-green text-stellar-green bg-stellar-green/10">
                Verified Offsets
              </Badge>
              <span className="text-xs text-muted-foreground">Certified Standards & Co-Benefits</span>
            </div>
            <Text variant="h1" as="h1" className="mt-1 mb-1">
              Carbon Offset Projects
            </Text>
            <Text variant="muted" as="p">
              Discover and compare high-integrity projects by type, location, certification standard, and co-benefits.
            </Text>
          </div>

        {/* Search Bar & Co-Benefit Quick Filters */}
        <div className="mb-6 space-y-3 bg-card/60 backdrop-blur-sm p-4 rounded-xl border border-border/60">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type="text"
                placeholder="Search projects by title, region, methodology, or co-benefits..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                variant="primary"
                inputSize="md"
                className="w-full pl-10"
              />
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                🔍
              </span>
            </div>
            <Button type="submit" stellar="primary">
              Search
            </Button>
          </form>

          {/* Quick Co-Benefit Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-muted-foreground mr-1">
              Filter by Co-Benefits:
            </span>
            {CORE_CO_BENEFITS.map((pill) => {
              const isSelected = filters.coBenefits?.includes(pill.key);
              return (
                <Badge
                  key={pill.key}
                  variant={isSelected ? 'accent' : 'outline'}
                  className={`cursor-pointer transition-all text-xs py-1 px-3 ${
                    isSelected
                      ? 'bg-stellar-purple text-white border-stellar-purple shadow-sm'
                      : 'hover:bg-stellar-purple/10'
                  }`}
                  onClick={() => handleToggleCoBenefitPill(pill.key)}
                >
                  {pill.label}
                  {isSelected && <span className="ml-1 font-bold">✓</span>}
                </Badge>
              );
            })}

            {filters.search && (
              <Badge
                variant="secondary"
                className="cursor-pointer text-xs"
                onClick={() => {
                  setSearchInput('');
                  handleFiltersChange({ ...filters, search: '' });
                }}
              >
                Query: &quot;{filters.search}&quot; ✕
              </Badge>
            )}

            {(filters.coBenefits?.length > 0 || filters.types.length > 0 || (filters.certificationStandards && filters.certificationStandards.length > 0)) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-muted-foreground hover:text-foreground underline ml-auto"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {/* Results Counter and View Mode Switcher */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing <strong className="text-foreground">{filteredProjects.length}</strong> {filteredProjects.length === 1 ? 'project' : 'projects'} matching criteria
          </span>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                ▦ Grid View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  viewMode === 'map'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                🗺 Interactive Map
              </button>
            </div>

            <Link href="/projects/map">
              <Button variant="ghost" size="sm" className="text-xs text-primary hover:underline">
                Fullscreen Map ↗
              </Button>
            </Link>
          </div>
        </div>

        {viewMode === 'map' ? (
          <div className="mb-8">
            <OffsetProjectMapWrapper projects={mockCarbonProjects} height="650px" showFilters={true} />
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Filter Sidebar */}
            <FilterSidebar
              filters={filters}
              onFiltersChange={handleFiltersChange}
              availableTypes={availableTypes}
              availableLocations={availableLocations}
              availableCoBenefits={availableCoBenefits}
              availableStandards={availableStandards}
              priceRange={priceRange}
              isOpen={isMobileFilterOpen}
              onClose={() => setIsMobileFilterOpen(false)}
            />

            {/* Projects Grid */}
            <div className="flex-1">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-16 border rounded-xl bg-card">
                  <span className="text-4xl block mb-2">🌿</span>
                  <Text variant="h3" as="h2" className="mb-2 font-semibold">
                    No projects match your filter combination
                  </Text>
                  <Text variant="muted" as="p" className="mb-4 text-sm max-w-md mx-auto">
                    Try clearing or relaxing co-benefit, certification standard, or price filters to view more available projects.
                  </Text>
                  <Button onClick={handleResetFilters} stellar="primary">
                    Reset All Filters
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProjects.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectsPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Text variant="muted" as="p">
            Loading offset project directory...
          </Text>
        </div>
      }
    >
      <ProjectsContent />
    </Suspense>
  );
}
