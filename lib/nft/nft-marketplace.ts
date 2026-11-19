import type {
  TreeNFTListing,
  NFTFilterOptions,
  RoyaltyBreakdown,
  NFTMarketplaceOffer,
  NFTTradeHistory,
} from '@/lib/types/nft-marketplace';

export const DEFAULT_PLATFORM_ROYALTY_PERCENT = 2.5;
export const DEFAULT_CREATOR_ROYALTY_PERCENT = 5.0;

export const MOCK_TREE_NFT_LISTINGS: TreeNFTListing[] = [
  {
    id: 'nft-list-1',
    tokenId: 'STLNFT-001092',
    nft: {
      tokenId: 'STLNFT-001092',
      treeId: 'TREE-KEN-9941',
      species: 'Acacia Xanthophloea',
      scientificName: 'Vachellia xanthophloea',
      location: 'Aberdare Forest, Kenya',
      region: 'East Africa',
      co2OffsetKgPerYear: 150,
      plantedDate: '2024-03-15',
      imageUrl: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=600&q=80',
      rarity: 'Legendary',
      verifier: 'Verra VCS Standard',
      certificateUri: 'ipfs://QmTreeCertAberdare001092',
    },
    sellerId: 'user-sponsor-881',
    sellerName: 'EcoCapital Vault',
    sellerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
    priceXlm: 250,
    priceUsd: 30,
    listedAt: '2026-08-20T10:00:00Z',
    isActive: true,
    royaltyConfig: {
      platformRoyaltyPercent: DEFAULT_PLATFORM_ROYALTY_PERCENT,
      creatorRoyaltyPercent: DEFAULT_CREATOR_ROYALTY_PERCENT,
      creatorAddress: 'GCREATOR8833KENYAFARMCREDITSTEL',
      platformAddress: 'GPLATFORMFEECOLLECTORSTELLAROS',
    },
    offers: [
      {
        id: 'offer-101',
        listingId: 'nft-list-1',
        buyerId: 'user-buyer-44',
        buyerName: 'GreenFund DAO',
        offerPriceXlm: 230,
        offerPriceUsd: 27.6,
        createdAt: '2026-08-22T14:15:00Z',
        status: 'pending',
      },
    ],
    tradeHistory: [
      {
        id: 'trade-01',
        listingId: 'nft-list-1',
        tokenId: 'STLNFT-001092',
        sellerId: 'user-planter-01',
        buyerId: 'user-sponsor-881',
        priceXlm: 180,
        priceUsd: 21.6,
        platformFeeXlm: 4.5,
        creatorRoyaltyXlm: 9.0,
        executedAt: '2025-11-10T09:30:00Z',
      },
    ],
  },
  {
    id: 'nft-list-2',
    tokenId: 'STLNFT-003481',
    nft: {
      tokenId: 'STLNFT-003481',
      treeId: 'TREE-BRAZ-4812',
      species: 'Brazilian Rosewood',
      scientificName: 'Dalbergia nigra',
      location: 'Amazon Rainforest, Brazil',
      region: 'South America',
      co2OffsetKgPerYear: 320,
      plantedDate: '2023-08-10',
      imageUrl: 'https://images.unsplash.com/photo-1511497584788-876761c119ef?auto=format&fit=crop&w=600&q=80',
      rarity: 'Epic',
      verifier: 'Gold Standard',
      certificateUri: 'ipfs://QmTreeCertAmazon003481',
    },
    sellerId: 'user-sponsor-312',
    sellerName: 'Amazonia Guardian',
    sellerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
    priceXlm: 400,
    priceUsd: 48,
    listedAt: '2026-08-25T16:30:00Z',
    isActive: true,
    royaltyConfig: {
      platformRoyaltyPercent: DEFAULT_PLATFORM_ROYALTY_PERCENT,
      creatorRoyaltyPercent: DEFAULT_CREATOR_ROYALTY_PERCENT,
      creatorAddress: 'GCREATORAMAZONREFORESTATION001',
      platformAddress: 'GPLATFORMFEECOLLECTORSTELLAROS',
    },
    offers: [],
    tradeHistory: [],
  },
  {
    id: 'nft-list-3',
    tokenId: 'STLNFT-005119',
    nft: {
      tokenId: 'STLNFT-005119',
      treeId: 'TREE-IND-9012',
      species: 'Red Sandalwood',
      scientificName: 'Pterocarpus santalinus',
      location: 'Western Ghats, India',
      region: 'South Asia',
      co2OffsetKgPerYear: 180,
      plantedDate: '2024-01-20',
      imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80',
      rarity: 'Rare',
      verifier: 'Plan Vivo Standard',
      certificateUri: 'ipfs://QmTreeCertIndia005119',
    },
    sellerId: 'user-sponsor-509',
    sellerName: 'Sandalwood Trust',
    priceXlm: 150,
    priceUsd: 18,
    listedAt: '2026-08-28T11:45:00Z',
    isActive: true,
    royaltyConfig: {
      platformRoyaltyPercent: DEFAULT_PLATFORM_ROYALTY_PERCENT,
      creatorRoyaltyPercent: DEFAULT_CREATOR_ROYALTY_PERCENT,
      creatorAddress: 'GCREATORINDIAWESTERNGHATS999',
      platformAddress: 'GPLATFORMFEECOLLECTORSTELLAROS',
    },
    offers: [],
    tradeHistory: [],
  },
  {
    id: 'nft-list-4',
    tokenId: 'STLNFT-008910',
    nft: {
      tokenId: 'STLNFT-008910',
      treeId: 'TREE-IDN-3301',
      species: 'Mangrove Rhizophora',
      scientificName: 'Rhizophora mucronata',
      location: 'Sumatra Mangroves, Indonesia',
      region: 'Southeast Asia',
      co2OffsetKgPerYear: 250,
      plantedDate: '2024-05-02',
      imageUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=80',
      rarity: 'Common',
      verifier: 'Verra VCS Standard',
      certificateUri: 'ipfs://QmTreeCertSumatra008910',
    },
    sellerId: 'user-sponsor-102',
    sellerName: 'Blue Carbon Action',
    priceXlm: 95,
    priceUsd: 11.4,
    listedAt: '2026-08-29T08:12:00Z',
    isActive: true,
    royaltyConfig: {
      platformRoyaltyPercent: DEFAULT_PLATFORM_ROYALTY_PERCENT,
      creatorRoyaltyPercent: DEFAULT_CREATOR_ROYALTY_PERCENT,
      creatorAddress: 'GCREATORINDONESIABLUECARBON11',
      platformAddress: 'GPLATFORMFEECOLLECTORSTELLAROS',
    },
    offers: [],
    tradeHistory: [],
  },
];

/**
 * Calculates platform and creator royalties for a tree sponsorship NFT trade
 */
export function calculateRoyaltyBreakdown(
  priceXlm: number,
  priceUsd: number,
  platformPercent: number = DEFAULT_PLATFORM_ROYALTY_PERCENT,
  creatorPercent: number = DEFAULT_CREATOR_ROYALTY_PERCENT
): RoyaltyBreakdown {
  const platformFeeXlm = Number(((priceXlm * platformPercent) / 100).toFixed(2));
  const platformFeeUsd = Number(((priceUsd * platformPercent) / 100).toFixed(2));

  const creatorRoyaltyXlm = Number(((priceXlm * creatorPercent) / 100).toFixed(2));
  const creatorRoyaltyUsd = Number(((priceUsd * creatorPercent) / 100).toFixed(2));

  const sellerNetProceedsXlm = Number(
    (priceXlm - platformFeeXlm - creatorRoyaltyXlm).toFixed(2)
  );
  const sellerNetProceedsUsd = Number(
    (priceUsd - platformFeeUsd - creatorRoyaltyUsd).toFixed(2)
  );

  return {
    listingPriceXlm: priceXlm,
    listingPriceUsd: priceUsd,
    platformFeeXlm,
    platformFeeUsd,
    creatorRoyaltyXlm,
    creatorRoyaltyUsd,
    sellerNetProceedsXlm,
    sellerNetProceedsUsd,
  };
}

/**
 * Filter and query Tree Sponsorship NFT Listings
 */
export function getTreeNFTListings(options: NFTFilterOptions = {}): TreeNFTListing[] {
  let result = MOCK_TREE_NFT_LISTINGS.filter((item) => item.isActive);

  if (options.searchQuery) {
    const q = options.searchQuery.toLowerCase();
    result = result.filter(
      (item) =>
        item.nft.species.toLowerCase().includes(q) ||
        item.nft.location.toLowerCase().includes(q) ||
        item.nft.tokenId.toLowerCase().includes(q) ||
        item.sellerName.toLowerCase().includes(q)
    );
  }

  if (options.species) {
    result = result.filter((item) => item.nft.species === options.species);
  }

  if (options.region) {
    result = result.filter((item) => item.nft.region === options.region);
  }

  if (options.rarity) {
    result = result.filter((item) => item.nft.rarity === options.rarity);
  }

  if (options.minPriceXlm !== undefined) {
    result = result.filter((item) => item.priceXlm >= (options.minPriceXlm ?? 0));
  }

  if (options.maxPriceXlm !== undefined) {
    result = result.filter((item) => item.priceXlm <= (options.maxPriceXlm ?? Infinity));
  }

  if (options.sortBy) {
    switch (options.sortBy) {
      case 'price-asc':
        result.sort((a, b) => a.priceXlm - b.priceXlm);
        break;
      case 'price-desc':
        result.sort((a, b) => b.priceXlm - a.priceXlm);
        break;
      case 'date-newest':
        result.sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime());
        break;
      case 'rarity':
        const rarityMap: Record<string, number> = { Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
        result.sort((a, b) => (rarityMap[b.nft.rarity] || 0) - (rarityMap[a.nft.rarity] || 0));
        break;
    }
  }

  return result;
}

/**
 * Retrieve single Tree NFT Listing by ID
 */
export function getTreeNFTListingById(id: string): TreeNFTListing | null {
  return MOCK_TREE_NFT_LISTINGS.find((item) => item.id === id) ?? null;
}
