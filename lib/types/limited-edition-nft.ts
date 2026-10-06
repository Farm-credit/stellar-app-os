/**
 * Types for limited-edition NFTs for rare tree species (#1162).
 *
 * These are distinct from standard impact certificates — they are
 * scarce, numbered collectibles tied to endangered species, heritage
 * varieties, and milestone plantings. Supply caps and rarity tiers
 * are enforced at the API layer before a Soroban mint transaction is built.
 */

import type { NetworkType } from './wallet';

// ── Rarity classification ─────────────────────────────────────────────────────

/**
 * Rarity tier determines supply cap and visual treatment.
 *
 * legendary  — ultra-rare (≤ 10 editions); critically endangered IUCN species
 * epic        — rare (≤ 50); endangered / heritage varieties
 * rare        — limited (≤ 250); vulnerable / regionally significant
 * uncommon    — limited (≤ 1 000); near-threatened
 */
export type NftRarityTier = 'legendary' | 'epic' | 'rare' | 'uncommon';

/** Conservation status from IUCN Red List */
export type IucnStatus = 'EX' | 'EW' | 'CR' | 'EN' | 'VU' | 'NT' | 'LC' | 'DD';

// ── Rare species catalogue entry ──────────────────────────────────────────────

export interface RareSpeciesEntry {
  /** Unique slug matching the main species catalogue */
  speciesSlug: string;
  commonName: string;
  scientificName: string;
  /** IUCN Red List conservation status */
  iucnStatus: IucnStatus;
  rarity: NftRarityTier;
  /** Maximum editions that can ever be minted for this species */
  maxSupply: number;
  /** Short lore text shown on the collectible card */
  lore: string;
  /** URL to the species illustration (SVG/PNG hosted on IPFS or S3) */
  imageUri: string;
  /** ISO-8601 date this species was added to the limited-edition programme */
  addedAt: string;
}

// ── NFT metadata ──────────────────────────────────────────────────────────────

export interface LimitedEditionNftMetadata {
  /** e.g. "African Blackwood #7 / 50" */
  name: string;
  description: string;
  /** IPFS / S3 URI of the collectible artwork */
  image: string;
  /** External link to the tree's progress page */
  externalUrl?: string;
  attributes: NftAttribute[];
  /** Harvesta platform identifier */
  platform: 'harvesta';
  /** Schema version for forward compatibility */
  schemaVersion: '1.0';
}

export interface NftAttribute {
  trait_type: string;
  value: string | number;
  display_type?: 'number' | 'boost_number' | 'boost_percentage' | 'date';
}

// ── API request / response shapes ─────────────────────────────────────────────

export interface MintLimitedEditionRequest {
  /** Species slug — must exist in the rare species catalogue */
  speciesSlug: string;
  /** Stellar address of the sponsor receiving the NFT */
  recipientAddress: string;
  /** Stellar transaction hash that funded the rare-species planting */
  txHash: string;
  /** Platform donation/project ID */
  donationId: string;
  /** ISO-8601 planting date */
  plantingDate: string;
  /** Region where the rare tree is being planted */
  region: string;
  network: NetworkType;
}

export interface MintLimitedEditionResponse {
  /** Soroban transaction XDR to sign and submit */
  transactionXdr: string;
  networkPassphrase: string;
  tokenId: string;
  metadataUri: string;
  /** Sequential edition number for this species (e.g. 7) */
  editionNumber: number;
  /** Total maximum supply for this species (e.g. 50) */
  maxSupply: number;
  rarity: NftRarityTier;
  speciesCommonName: string;
  scientificName: string;
}

export interface GetRareSpeciesRequest {
  /** Filter by rarity tier */
  rarity?: NftRarityTier;
  /** Only return species that still have editions remaining */
  availableOnly?: boolean;
}

export interface RareSpeciesWithAvailability extends RareSpeciesEntry {
  /** How many editions have been minted so far */
  mintedCount: number;
  /** How many editions remain */
  remainingSupply: number;
  /** Whether new mints are allowed */
  soldOut: boolean;
}

export interface GetRareSpeciesResponse {
  species: RareSpeciesWithAvailability[];
  total: number;
}
