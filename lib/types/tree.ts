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

export type TreeGrowthStage = 'sapling' | 'juvenile' | 'mature';

export interface Tree {
  id: string;
  treeId: string;
  species: TreeSpecies;
  region: string;
  status: TreeStatus;
  /** Current developmental growth stage of the tree. */
  growthStage?: TreeGrowthStage;
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
  /** Optional personalised dedication inscription (max 200 chars) shown on the tree profile. */
  dedication?: string;
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
  /** Human-readable code of the seed batch (e.g. "SB-2024-001"). */
  seedBatchCode?: string;
  /** Identifier of the seed bank that supplied the seed batch. */
  seedBankId?: string;
  /** Identifier of the collection site record for the seed's origin. */
  collectionSiteId?: string;
  /** Ordered provenance trail for the seed batch this tree was grown from. */
  provenanceEvents?: SeedProvenanceEvent[];
  /** Ordered list of organisations the seed batch passed through (seed bank → nursery → planting site). */
  distributionChain?: string[];
}

export type SeedProvenanceStage =
  | 'collection'
  | 'processing'
  | 'storage'
  | 'distribution'
  | 'nursery'
  | 'planting';

export interface SeedProvenanceEvent {
  /** Stage of the seed lifecycle this event records. */
  stage: SeedProvenanceStage;
  /** ISO timestamp of when the event occurred. */
  occurredAt: string;
  /** Location where the event took place. */
  location: string;
  /** Person or organisation responsible for the event. */
  actor: string;
  /** Optional free-form notes about the event. */
  notes?: string;
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
