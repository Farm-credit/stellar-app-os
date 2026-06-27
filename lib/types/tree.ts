export type TreeSpecies = 'Teak' | 'Moringa' | 'Eucalyptus' | 'Mangrove';

export type TreeStatus = 'funded' | 'planted' | 'verified' | 'completed' | 'failed';

export interface Tree {
  id: string;
  treeId: string;
  species: TreeSpecies;
  region: string;
  status: TreeStatus;
  plantedAt?: string;
  lat: number;
  lng: number;
  co2OffsetKgPerYear: number;
  projectName: string;
}

export interface TreeFilterState {
  search: string;
  species: TreeSpecies | 'all';
  region: string | 'all';
  status: TreeStatus | 'all';
}

export interface TreeFilterBarProps {
  filters: TreeFilterState;
  speciesOptions: TreeSpecies[];
  regionOptions: string[];
  statusOptions: TreeStatus[];
  onFilterChange: (filters: Partial<TreeFilterState>) => void;
}

export interface TreesResponse {
  trees: Tree[];
  speciesOptions: TreeSpecies[];
  regionOptions: string[];
  statusOptions: TreeStatus[];
  totalCount: number;
}
