import { NextRequest, NextResponse } from 'next/server';
import { getTreeNFTListingById, calculateRoyaltyBreakdown } from '@/lib/nft/nft-marketplace';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listing = getTreeNFTListingById(id);

    if (!listing) {
      return NextResponse.json(
        { success: false, error: 'Tree NFT listing not found' },
        { status: 404 }
      );
    }

    const royalties = calculateRoyaltyBreakdown(
      listing.priceXlm,
      listing.priceUsd,
      listing.royaltyConfig.platformRoyaltyPercent,
      listing.royaltyConfig.creatorRoyaltyPercent
    );

    return NextResponse.json({
      success: true,
      listing,
      royaltyBreakdown: royalties,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch NFT listing details' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, buyerId, buyerName, offerPriceXlm } = body;

    const listing = getTreeNFTListingById(id);
    if (!listing) {
      return NextResponse.json(
        { success: false, error: 'Tree NFT listing not found' },
        { status: 404 }
      );
    }

    const royalties = calculateRoyaltyBreakdown(
      listing.priceXlm,
      listing.priceUsd,
      listing.royaltyConfig.platformRoyaltyPercent,
      listing.royaltyConfig.creatorRoyaltyPercent
    );

    if (action === 'buy') {
      const tradeRecord = {
        id: `trade-${Date.now()}`,
        listingId: listing.id,
        tokenId: listing.tokenId,
        sellerId: listing.sellerId,
        buyerId: buyerId || 'anonymous-buyer',
        priceXlm: listing.priceXlm,
        priceUsd: listing.priceUsd,
        platformFeeXlm: royalties.platformFeeXlm,
        creatorRoyaltyXlm: royalties.creatorRoyaltyXlm,
        executedAt: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        message: 'Successfully purchased Tree Sponsorship NFT!',
        trade: tradeRecord,
        royaltyBreakdown: royalties,
      });
    }

    if (action === 'offer') {
      if (!offerPriceXlm) {
        return NextResponse.json(
          { success: false, error: 'Offer price in XLM is required' },
          { status: 400 }
        );
      }

      const offerPriceUsd = Number((offerPriceXlm * 0.12).toFixed(2));
      const offerRecord = {
        id: `offer-${Date.now()}`,
        listingId: listing.id,
        buyerId: buyerId || 'user-bidder',
        buyerName: buyerName || 'Tree Collector',
        offerPriceXlm,
        offerPriceUsd,
        createdAt: new Date().toISOString(),
        status: 'pending' as const,
      };

      return NextResponse.json({
        success: true,
        message: 'Offer placed successfully!',
        offer: offerRecord,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action specified. Supported: buy, offer' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to process NFT marketplace transaction' },
      { status: 500 }
    );
  }
}
