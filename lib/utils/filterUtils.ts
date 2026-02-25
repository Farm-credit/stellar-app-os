import type { ProjectFilters } from '@/lib/types/filters';
import type { CarbonProject } from '@/lib/types/carbon';

export function parseFiltersFromUrl(searchParams: URLSearchParams): ProjectFilters {
  const types = searchParams.get('types')?.split(',').filter(Boolean) || [];
  const locations = searchParams.get('locations')?.split(',').filter(Boolean) || [];
  const coBenefits = searchParams.get('coBenefits')?.split(',').filter(Boolean) || [];
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');

  return {
    types: types as ProjectFilters['types'],
    locations,
    priceRange: {
      min: minPrice ? parseFloat(minPrice) : 0,
      max: maxPrice ? parseFloat(maxPrice) : 100,
    },
    coBenefits,
  };
}

export function buildFiltersUrl(filters: ProjectFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.types.length > 0) {
    params.set('types', filters.types.join(','));
  }
  if (filters.locations.length > 0) {
    params.set('locations', filters.locations.join(','));
  }
  if (filters.coBenefits.length > 0) {
    params.set('coBenefits', filters.coBenefits.join(','));
  }
  if (filters.priceRange.min > 0) {
    params.set('minPrice', filters.priceRange.min.toString());
  }
  if (filters.priceRange.max < 100) {
    params.set('maxPrice', filters.priceRange.max.toString());
  }

  return params;
}

export function getActiveFilterCount(filters: ProjectFilters): number {
  let count = 0;
  if (filters.types.length > 0) count += filters.types.length;
  if (filters.locations.length > 0) count += filters.locations.length;
  if (filters.coBenefits.length > 0) count += filters.coBenefits.length;
  if (filters.priceRange.min > 0 || filters.priceRange.max < 100) count += 1;
  return count;
}

export function applyFilters(projects: CarbonProject[], filters: ProjectFilters): CarbonProject[] {
  return projects.filter((project) => {
    // Type filter (AND logic - all selected types must match)
    if (filters.types.length > 0 && !filters.types.includes(project.type)) {
      return false;
    }

    // Location filter (AND logic - all selected locations must match)
    if (filters.locations.length > 0 && !filters.locations.includes(project.location)) {
      return false;
    }

    // Price range filter
    if (
      project.pricePerTon < filters.priceRange.min ||
      project.pricePerTon > filters.priceRange.max
    ) {
      return false;
    }

    // Co-benefits filter (AND logic - project must have ALL selected co-benefits)
    if (filters.coBenefits.length > 0) {
      const hasAllCoBenefits = filters.coBenefits.every((benefit) =>
        project.coBenefits.includes(benefit)
      );
      if (!hasAllCoBenefits) {
        return false;
      }
    }

    return true;
  });
}

export function extractUniqueValues<T extends string>(
  projects: CarbonProject[],
  // eslint-disable-next-line no-unused-vars
  extractor: (project: CarbonProject) => T | T[]
): T[] {
  const values = new Set<T>();
  for (const project of projects) {
    const value = extractor(project);
    if (Array.isArray(value)) {
      for (const v of value) {
        values.add(v as T);
      }
    } else {
      values.add(value as T);
    }
  }
  return Array.from(values).sort();
}
