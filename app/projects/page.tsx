'use client';

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilterSidebar } from '@/components/organisms/FilterSidebar/FilterSidebar';
import { Button } from '@/components/atoms/Button';
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
