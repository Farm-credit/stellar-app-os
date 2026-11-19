import type { ProjectFilters } from '@/lib/types/filters';
import type { CarbonProject } from '@/lib/types/carbon';

export function parseFiltersFromUrl(searchParams: URLSearchParams): ProjectFilters {
  const search = searchParams.get('search')?.trim() || '';
  const types = searchParams.get('types')?.split(',').filter(Boolean) || [];
  const locations = searchParams.get('locations')?.split(',').filter(Boolean) || [];
  const coBenefits = searchParams.get('coBenefits')?.split(',').filter(Boolean) || [];
  const standards =
    searchParams.get('standards')?.split(',').filter(Boolean) ||
    searchParams.get('certificationStandards')?.split(',').filter(Boolean) ||
    [];
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');

  return {
    search,
    types: types as ProjectFilters['types'],
    locations,
    priceRange: {
      min: minPrice ? parseFloat(minPrice) : 0,
      max: maxPrice ? parseFloat(maxPrice) : 100,
    },
    coBenefits,
    certificationStandards: standards,
  };
}

export function buildFiltersUrl(filters: ProjectFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search && filters.search.trim()) {
    params.set('search', filters.search.trim());
  }
  if (filters.types.length > 0) {
    params.set('types', filters.types.join(','));
  }
  if (filters.locations.length > 0) {
    params.set('locations', filters.locations.join(','));
  }
  if (filters.coBenefits.length > 0) {
    params.set('coBenefits', filters.coBenefits.join(','));
  }
  if (filters.certificationStandards && filters.certificationStandards.length > 0) {
    params.set('standards', filters.certificationStandards.join(','));
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
  if (filters.search && filters.search.trim().length > 0) count += 1;
  if (filters.types.length > 0) count += filters.types.length;
  if (filters.locations.length > 0) count += filters.locations.length;
  if (filters.coBenefits.length > 0) count += filters.coBenefits.length;
  if (filters.certificationStandards && filters.certificationStandards.length > 0) {
    count += filters.certificationStandards.length;
  }
  if (filters.priceRange.min > 0 || filters.priceRange.max < 100) count += 1;
  return count;
}

/**
 * Checks whether a project has a given co-benefit, supporting both exact names
 * and core canonical categories: 'biodiversity', 'water', and 'soil'.
 */
export function projectMatchesCoBenefit(project: CarbonProject, benefitFilter: string): boolean {
  const query = benefitFilter.toLowerCase().trim();

  return project.coBenefits.some((b) => {
    const existing = b.toLowerCase().trim();
    if (existing === query) return true;

    // Canonical category matchers for Biodiversity, Water, Soil
    if (query === 'biodiversity' && (existing.includes('biodiversity') || existing.includes('wildlife'))) {
      return true;
    }
    if (query === 'water' && (existing.includes('water') || existing.includes('watershed') || existing.includes('aquifer'))) {
      return true;
    }
    if (query === 'soil' && (existing.includes('soil') || existing.includes('organic carbon'))) {
      return true;
    }

    return existing.includes(query);
  });
}

export function applyFilters(projects: CarbonProject[], filters: ProjectFilters): CarbonProject[] {
  return projects.filter((project) => {
    // Search query filter (matches name, description, location, type, coBenefits)
    if (filters.search && filters.search.trim().length > 0) {
      const q = filters.search.toLowerCase().trim();
      const matchesSearch =
        project.name.toLowerCase().includes(q) ||
        project.description.toLowerCase().includes(q) ||
        project.location.toLowerCase().includes(q) ||
        project.type.toLowerCase().includes(q) ||
        project.coBenefits.some((cb) => cb.toLowerCase().includes(q)) ||
        project.verificationStatus.toLowerCase().includes(q);

      if (!matchesSearch) {
        return false;
      }
    }

    // Type filter
    if (filters.types.length > 0 && !filters.types.includes(project.type)) {
      return false;
    }

    // Location filter
    if (filters.locations.length > 0 && !filters.locations.includes(project.location)) {
      return false;
    }

    // Certification standard filter
    if (
      filters.certificationStandards &&
      filters.certificationStandards.length > 0 &&
      !filters.certificationStandards.includes(project.verificationStatus)
    ) {
      return false;
    }

    // Price range filter
    if (
      project.pricePerTon < filters.priceRange.min ||
      project.pricePerTon > filters.priceRange.max
    ) {
      return false;
    }

    // Co-benefits filter (project must satisfy all selected co-benefits)
    if (filters.coBenefits && filters.coBenefits.length > 0) {
      const hasAllCoBenefits = filters.coBenefits.every((benefit) =>
        projectMatchesCoBenefit(project, benefit)
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
  extractor: (project: CarbonProject) => T | T[]
): T[] {
  const values = new Set<T>();
  for (const project of projects) {
    const value = extractor(project);
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v) values.add(v as T);
      }
    } else if (value) {
      values.add(value as T);
    }
  }
  return Array.from(values).sort();
}
