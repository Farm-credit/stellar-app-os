export type TreeSpecies =
  | 'Teak'
  | 'Moringa'
  | 'Eucalyptus'
  | 'Mangrove'
  | 'Acacia'
  | 'Neem'
  | 'African Mahogany'
  | 'Baobab'
  | 'Bamboo (Moso)'
  | 'West African Cedar'
  | 'Caribbean Pine'
  | 'Iroko'
  | 'Shea'
  | 'Cashew'
  | 'African Locust Bean';

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
  /** Climate zone used for CO₂ estimates; inferred from latitude when absent. */
  climateZone?: 'tropical' | 'subtropical' | 'temperate' | 'arid' | 'coastal';
  projectName: string;
  /** On-chain collectible ID and current owner for sponsored trees. */
  nftTokenId?: string;
  nftOwner?: string;
  /** Public-facing sponsor display name used on milestone sharing cards. */
  sponsorName?: string;
  /** Optional evidence image shown on the tree detail page. */
  imageUrl?: string;
  /** Identifier of the seed batch this tree was grown from. */
  seedBatchId?: string;
  /** Name of the seed bank that supplied the seed batch. */
  seedBankName?: string;
  /** Free-form provenance notes describing the seed's origin and handling. */
  provenanceNotes?: string;
  /** Collection site where the seed was originally gathered. */
  collectionSite?: string;
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
