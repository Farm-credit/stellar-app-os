'use client';

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterSidebar } from '@/components/organisms/FilterSidebar/FilterSidebar';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import {
  parseFiltersFromUrl,
  buildFiltersUrl,
  applyFilters,
  extractUniqueValues,
} from '@/lib/utils/filterUtils';
import { createDefaultFilters } from '@/lib/types/filters';
import type { ProjectFilters } from '@/lib/types/filters';
import type { CarbonProject } from '@/lib/types/carbon';

function ProjectsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ProjectFilters>(createDefaultFilters());
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  useEffect(() => {
    const urlFilters = parseFiltersFromUrl(searchParams);
    requestAnimationFrame(() => {
      setFilters((prev) => {
        // Only update if filters actually changed
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

  const handleResetFilters = useCallback(() => {
    setFilters(createDefaultFilters(priceRange));
    router.push('/projects', { scroll: false });
  }, [router, priceRange]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Text variant="h1" as="h1" className="mb-2">
              Carbon Credit Projects
            </Text>
            <Text variant="muted" as="p">
              {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}{' '}
              found
            </Text>
          </div>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}
            className="lg:hidden"
            aria-label="Toggle filters"
            aria-expanded={isMobileFilterOpen}
          >
            Filters
          </Button>
        </div>

        <div className="flex gap-6">
          {/* Filter Sidebar */}
          <FilterSidebar
            filters={filters}
            onFiltersChange={handleFiltersChange}
            availableTypes={availableTypes}
            availableLocations={availableLocations}
            availableCoBenefits={availableCoBenefits}
            priceRange={priceRange}
            isOpen={isMobileFilterOpen}
            onClose={() => setIsMobileFilterOpen(false)}
          />

          {/* Projects Grid */}
          <div className="flex-1">
            {filteredProjects.length === 0 ? (
              <div className="text-center py-12">
                <Text variant="h3" as="h2" className="mb-2">
                  No projects found
                </Text>
                <Text variant="muted" as="p" className="mb-4">
                  Try adjusting your filters to see more results.
                </Text>
                <Button onClick={handleResetFilters} stellar="primary">
                  Reset Filters
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
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: CarbonProject }) {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4 hover:shadow-lg transition-shadow">
      <div>
        <div className="flex items-start justify-between mb-2">
          <Text variant="h4" as="h3" className="font-semibold">
            {project.name}
          </Text>
          {project.isOutOfStock && (
            <Badge variant="outline" className="ml-2">
              Out of Stock
            </Badge>
          )}
        </div>
        <Text variant="muted" as="p" className="text-sm">
          {project.description}
        </Text>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Type
          </Text>
          <Badge variant="default">{project.type}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Location
          </Text>
          <Text variant="small" as="span">
            {project.location}
          </Text>
        </div>
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Vintage Year
          </Text>
          <Text variant="small" as="span">
            {project.vintageYear}
          </Text>
        </div>
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Price per Ton
          </Text>
          <Text variant="small" as="span" className="font-semibold">
            ${project.pricePerTon.toFixed(2)}
          </Text>
        </div>
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Available
          </Text>
          <Text variant="small" as="span">
            {project.availableSupply.toFixed(2)} tons
          </Text>
        </div>
      </div>

      {project.coBenefits.length > 0 && (
        <div>
          <Text variant="small" as="span" className="text-muted-foreground block mb-2">
            Co-benefits
          </Text>
          <div className="flex flex-wrap gap-2">
            {project.coBenefits.map((benefit) => (
              <Badge
                key={benefit}
                variant="accent"
                className="bg-stellar-purple/10 text-stellar-purple border-stellar-purple/20"
              >
                {benefit}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4 border-t">
        <Badge variant="success">{project.verificationStatus}</Badge>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <Text variant="h3" as="h2" className="mb-2">
              Loading...
            </Text>
          </div>
        </div>
      }
    >
      <ProjectsContent />
    </Suspense>
  );
}
