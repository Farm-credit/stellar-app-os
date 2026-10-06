import { NextRequest, NextResponse } from 'next/server';
import {
  getTreeNFTListings,
  calculateRoyaltyBreakdown,
  DEFAULT_PLATFORM_ROYALTY_PERCENT,
  DEFAULT_CREATOR_ROYALTY_PERCENT,
} from '@/lib/nft/nft-marketplace';
import type { NFTRarity } from '@/lib/types/nft-marketplace';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const searchQuery = searchParams.get('search') || undefined;
    const species = searchParams.get('species') || undefined;
    const region = searchParams.get('region') || undefined;
    const rarity = (searchParams.get('rarity') as NFTRarity) || undefined;
    const minPriceXlm = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined;
    const maxPriceXlm = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;
    const sortBy = searchParams.get('sort') as any || 'date-newest';

    const listings = getTreeNFTListings({
      searchQuery,
      species,
      region,
      rarity,
      minPriceXlm,
      maxPriceXlm,
      sortBy,
    });

    return NextResponse.json({
      success: true,
      totalCount: listings.length,
      listings,
      platformRoyaltyPercent: DEFAULT_PLATFORM_ROYALTY_PERCENT,
      creatorRoyaltyPercent: DEFAULT_CREATOR_ROYALTY_PERCENT,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch NFT marketplace listings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tokenId, treeId, species, location, priceXlm, sellerId, sellerName } = body;

    if (!tokenId || !treeId || !priceXlm || !sellerId) {
      return NextResponse.json(
        { success: false, error: 'Missing required listing parameters' },
        { status: 400 }
      );
    }

    const priceUsd = Number((priceXlm * 0.12).toFixed(2)); // $0.12 per XLM rate
    const royalties = calculateRoyaltyBreakdown(priceXlm, priceUsd);

    const newListing = {
      id: `nft-list-${Date.now()}`,
      tokenId,
      nft: {
        tokenId,
        treeId,
        species: species || 'Unknown Species',
        scientificName: body.scientificName || 'Arbor spec.',
        location: location || 'Global Forest',
        region: body.region || 'Global',
        co2OffsetKgPerYear: body.co2OffsetKgPerYear || 100,
        plantedDate: new Date().toISOString().split('T')[0],
        imageUrl: body.imageUrl || 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=600&q=80',
        rarity: body.rarity || 'Rare',
        verifier: 'Verra VCS Standard',
        certificateUri: `ipfs://QmTreeCert${tokenId}`,
      },
      sellerId,
      sellerName: sellerName || 'Tree Sponsor',
      priceXlm,
      priceUsd,
      listedAt: new Date().toISOString(),
      isActive: true,
      royaltyConfig: {
        platformRoyaltyPercent: DEFAULT_PLATFORM_ROYALTY_PERCENT,
        creatorRoyaltyPercent: DEFAULT_CREATOR_ROYALTY_PERCENT,
        creatorAddress: 'GCREATORDEFAULTADDRESSSTELOS',
        platformAddress: 'GPLATFORMFEECOLLECTORSTELLAROS',
      },
      offers: [],
      tradeHistory: [],
    };

    return NextResponse.json({
      success: true,
      listing: newListing,
      royaltyBreakdown: royalties,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to create tree sponsorship NFT listing' },
      { status: 500 }
    );
  }
}
