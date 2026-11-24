import type { ProjectType, VerificationStatus } from './carbon';

export interface ProjectFilters {
  search?: string;
  types: ProjectType[];
  locations: string[];
  priceRange: {
    min: number;
    max: number;
  };
  coBenefits: string[];
  certificationStandards: (VerificationStatus | string)[];
}

export interface FilterSidebarProps {
  filters: ProjectFilters;
  onFiltersChange: (filters: ProjectFilters) => void;
  availableTypes: ProjectType[];
  availableLocations: string[];
  availableCoBenefits: string[];
  availableStandards?: string[];
  priceRange: {
    min: number;
    max: number;
  };
  isOpen?: boolean;
  onClose?: () => void;
}

export function createDefaultFilters(priceRange?: { min: number; max: number }): ProjectFilters {
  return {
    search: '',
    types: [],
    locations: [],
    priceRange: priceRange || {
      min: 0,
      max: 100,
    },
    coBenefits: [],
    certificationStandards: [],
  };
}

export const DEFAULT_FILTERS: ProjectFilters = createDefaultFilters();
