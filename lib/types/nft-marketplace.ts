/**
 * Type definitions for Tree Sponsorship NFT Marketplace
 * Requirement: Issue #1161 - OpenSea-style marketplace for tree sponsorship NFTs
 */

export type NFTRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export interface NFTRoyaltyConfig {
  /** Platform royalty percentage (e.g. 2.5%) */
  platformRoyaltyPercent: number;
  /** Creator / Project planter royalty percentage (e.g. 5.0%) */
  creatorRoyaltyPercent: number;
  /** Address of creator / project recipient */
  creatorAddress: string;
  /** Address of platform fee recipient */
  platformAddress: string;
}

export interface TreeSponsorshipNFT {
  tokenId: string;
  treeId: string;
  species: string;
  scientificName: string;
  location: string;
  region: string;
  co2OffsetKgPerYear: number;
  plantedDate: string;
  imageUrl: string;
  rarity: NFTRarity;
  verifier: string;
  certificateUri: string;
}

export interface TreeNFTListing {
  id: string;
  tokenId: string;
  nft: TreeSponsorshipNFT;
  sellerId: string;
  sellerName: string;
  sellerAvatar?: string;
  priceXlm: number;
  priceUsd: number;
  listedAt: string;
  isActive: boolean;
  royaltyConfig: NFTRoyaltyConfig;
  offers: NFTMarketplaceOffer[];
  tradeHistory: NFTTradeHistory[];
}

export interface NFTMarketplaceOffer {
  id: string;
  listingId: string;
  buyerId: string;
  buyerName: string;
  offerPriceXlm: number;
  offerPriceUsd: number;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
}

export interface NFTTradeHistory {
  id: string;
  listingId: string;
  tokenId: string;
  sellerId: string;
  buyerId: string;
  priceXlm: number;
  priceUsd: number;
  platformFeeXlm: number;
  creatorRoyaltyXlm: number;
  executedAt: string;
}

export interface NFTFilterOptions {
  searchQuery?: string;
  species?: string;
  region?: string;
  rarity?: NFTRarity;
  minPriceXlm?: number;
  maxPriceXlm?: number;
  sortBy?: 'price-asc' | 'price-desc' | 'date-newest' | 'rarity';
}

export interface RoyaltyBreakdown {
  listingPriceXlm: number;
  listingPriceUsd: number;
  platformFeeXlm: number;
  platformFeeUsd: number;
  creatorRoyaltyXlm: number;
  creatorRoyaltyUsd: number;
  sellerNetProceedsXlm: number;
  sellerNetProceedsUsd: number;
}
