/**
 * Sponsored-tree data service — Issue #1619
 *
 * Returns only trees that have a verified sponsor attribution and valid
 * geographic coordinates. Filter options are derived from the actual
 * dataset so the UI never shows stale or hardcoded values.
 *
 * Ownership NFT support (Stellar): each sponsored tree carries an
 * `ownershipNft` descriptor whose metadata includes species, GPS
 * coordinates, and planting date. The NFT is minted on sponsorship
 * confirmation and is viewable from the sponsor's connected Stellar wallet.
 */

import { getMockTrees } from '@/lib/api/mock/trees';
import type { TreeSpecies } from '@/lib/types/tree';
import type {
  SponsoredTree,
  SponsoredTreeFilters,
  SponsoredTreeFilterOptions,
  SponsoredTreesResponse,
} from '@/lib/types/sponsored-tree';

/** Stellar network the ownership NFTs are minted on. */
export type StellarNetwork = 'testnet' | 'mainnet';

/** Metadata embedded in each ownership NFT. */
export interface TreeOwnershipNftMetadata {
  name: string;
  description: string;
  species: TreeSpecies;
  latitude: number;
  longitude: number;
  plantedAt: string | null;
  sponsorName: string;
  treeId: string;
}

/** Descriptor for a Stellar-native ownership NFT tied to a sponsored tree. */
export interface TreeOwnershipNft {
  /** Stellar asset code (<= 12 alphanumeric chars). */
  assetCode: string;
  /** Issuer account (G...) that controls minting for this asset. */
  issuer: string;
  /** Asset identifier, e.g. `TREE<id>:G...`. */
  assetId: string;
  network: StellarNetwork;
  /** Sponsor account the NFT is (or will be) delivered to. */
  ownerAccount: string | null;
  /** Mint status. */
  status: 'minted' | 'pending';
  metadata: TreeOwnershipNftMetadata;
}

/**
 * Map of sponsor display names → stable IDs.
 * Derived once from whatever names appear in the mock data.
 */
function buildSponsorIdMap(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of names) {
    if (!map.has(name)) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      map.set(name, `sp-${slug}`);
    }
  }
  return map;
}

/** Returns true when the given lat/lng represent a valid geographic point. */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0) // Null Island — placeholder for missing data
  );
}

/** Safely extract the UTC full year from an ISO date string. */
export function parsePlantingYear(plantedAt: string | undefined): number | null {
  if (!plantedAt) return null;
  const date = new Date(plantedAt);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return year;
}

/** Validate that a species string is a known TreeSpecies value. */
export function isValidSpeciesFilter(species: string, known: TreeSpecies[]): boolean {
  return species === 'all' || known.includes(species as TreeSpecies);
}

/** Validate that a planting year is within a reasonable range. */
export function isValidYearFilter(year: number | string): year is number {
  if (typeof year === 'string') return false;
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
}

/**
 * Build the Stellar asset code for a tree. Asset codes are limited to
 * 12 alphanumeric characters, so the tree ID is normalized and truncated.
 */
export function buildOwnershipAssetCode(treeId: string): string {
  const normalized = treeId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `TREE${normalized}`.slice(0, 12);
}

/**
 * Build the ownership NFT metadata for a sponsored tree. Pure function:
 * the same tree always yields the same metadata.
 */
export function buildOwnershipNftMetadata(tree: SponsoredTree): TreeOwnershipNftMetadata {
  return {
    name: `Tree Ownership #${tree.id}`,
    description: `Ownership certificate for ${tree.species} tree sponsored by ${tree.sponsorName}`,
    species: tree.species,
    latitude: tree.lat,
    longitude: tree.lng,
    plantedAt: tree.plantedAt ?? null,
    sponsorName: tree.sponsorName,
    treeId: tree.id,
  };
}

/**
 * Produce the ownership NFT descriptor for a sponsored tree.
 *
 * The NFT is considered minted once the sponsor account is known and the
 * tree has passed sponsorship confirmation (`sponsorConfirmed`). Until then
 * the status is `pending`, and it is minted automatically on confirmation.
 */
export function buildOwnershipNft(
  tree: SponsoredTree,
  options: {
    issuer: string;
    network?: StellarNetwork;
    ownerAccount?: string | null;
    sponsorConfirmed?: boolean;
  }
): TreeOwnershipNft {
  const assetCode = buildOwnershipAssetCode(tree.id);
  const ownerAccount = options.ownerAccount ?? null;
  const status: TreeOwnershipNft['status'] =
    options.sponsorConfirmed && ownerAccount ? 'minted' : 'pending';

  return {
    assetCode,
    issuer: options.issuer,
    assetId: `${assetCode}:${options.issuer}`,
    network: options.network ?? 'testnet',
    ownerAccount,
    status,
    metadata: buildOwnershipNftMetadata(tree),
  };
}

/**
 * Fetch all sponsored trees with sponsor attribution and valid coordinates.
 *
 * Returns the filtered dataset along with dynamically derived filter options.
 * All filters are applied as AND conditions.
 */
export function fetchSponsoredTrees(
  filters: SponsoredTreeFilters = { species: 'all', plantingYear: 'all', sponsor: 'all' }
): SponsoredTreesResponse {
  const allTrees = getMockTrees();

  // 1. Identify sponsored trees with valid coords
  const sponsorNames = allTrees
    .filter((t) => typeof t.sponsorName === 'string' && t.sponsorName.length > 0)
    .map((t) => t.sponsorName as string);

  const sponsorIdMap = buildSponsorIdMap(sponsorNames);

  const sponsoredTrees: SponsoredTree[] = allTrees
    .filter((tree) => {
      // Must have a sponsor name
      if (!tree.sponsorName || tree.sponsorName.trim().length === 0) return false;
      // Must have valid coordinates
      if (!isValidCoordinate(tree.lat, tree.lng)) return false;
      return true;
    })
    .map((tree) => ({
      ...tree,
      sponsorName: tree.sponsorName as string,
      sponsorId: sponsorIdMap.get(tree.sponsorName as string) ?? 'sp-unknown',
    }));

  // 2. Build filter options from the unfiltered sponsored set
  const filterOptions = buildFilterOptions(sponsoredTrees);

  // 3. Apply user-selected filters
  const filtered = applyFilters(sponsoredTrees, filters, filterOptions);

  return {
    trees: filtered,
    filterOptions,
    totalCount: filtered.length,
  };
}

function buildFilterOptions(trees: SponsoredTree[]): SponsoredTreeFilterOptions {
  const speciesSet = new Set<TreeSpecies>();
  const yearSet = new Set<number>();
  const sponsorMap = new Map<string, string>(); // id → name

  for (const tree of trees) {
    speciesSet.add(tree.species);

    const year = parsePlantingYear(tree.plantedAt);
    if (year !== null) yearSet.add(year);

    sponsorMap.set(tree.sponsorId, tree.sponsorName);
  }

  return {
    species: [...speciesSet].sort(),
    plantingYears: [...yearSet].sort((a, b) => b - a), // newest first
    sponsors: [...sponsorMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function applyFilters(
  trees: SponsoredTree[],
  filters: SponsoredTreeFilters,
  options: SponsoredTreeFilterOptions
): SponsoredTree[] {
  return trees.filter((tree) => {
    // Species filter
    if (filters.species !== 'all') {
      if (!isValidSpeciesFilter(filters.species, options.species)) return false;
      if (tree.species !== filters.species) return false;
    }

    // Planting year filter
    if (filters.plantingYear !== 'all') {
      if (!isValidYearFilter(filters.plantingYear)) return false;
      const treeYear = parsePlantingYear(tree.plantedAt);
      if (treeYear !== filters.plantingYear) return false;
    }

    // Sponsor filter
    if (filters.sponsor !== 'all') {
      if (tree.sponsorId !== filters.sponsor) return false;
    }

    return true;
  });
}
