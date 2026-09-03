/**
 * GET /api/nft/limited-edition/species
 *
 * Returns the catalogue of rare species eligible for limited-edition NFTs,
 * enriched with live mint counts and remaining supply from Redis (#1162).
 *
 * Query parameters:
 *   rarity        — filter by tier: legendary | epic | rare | uncommon
 *   availableOnly — if "true", exclude sold-out species
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getAllRareSpecies, getRareSpeciesByRarity } from '@/lib/nft/rare-species-catalogue';
import { getMintCount } from '@/lib/nft/limited-edition-mint';
import type {
  NftRarityTier,
  RareSpeciesWithAvailability,
  GetRareSpeciesResponse,
} from '@/lib/types/limited-edition-nft';

export const runtime = 'nodejs';

const VALID_RARITY_TIERS: NftRarityTier[] = ['legendary', 'epic', 'rare', 'uncommon'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const rarityParam = searchParams.get('rarity');
  const availableOnlyParam = searchParams.get('availableOnly');

  // Validate rarity filter
  if (rarityParam && !VALID_RARITY_TIERS.includes(rarityParam as NftRarityTier)) {
    return NextResponse.json(
      { error: `rarity must be one of: ${VALID_RARITY_TIERS.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const baseSpecies = rarityParam
      ? getRareSpeciesByRarity(rarityParam as NftRarityTier)
      : getAllRareSpecies();

    // Fetch mint counts concurrently
    const mintCounts = await Promise.all(
      baseSpecies.map((s) => getMintCount(s.speciesSlug))
    );

    let enriched: RareSpeciesWithAvailability[] = baseSpecies.map((s, i) => ({
      ...s,
      mintedCount: mintCounts[i],
      remainingSupply: Math.max(0, s.maxSupply - mintCounts[i]),
      soldOut: mintCounts[i] >= s.maxSupply,
    }));

    if (availableOnlyParam === 'true') {
      enriched = enriched.filter((s) => !s.soldOut);
    }

    const response: GetRareSpeciesResponse = {
      species: enriched,
      total: enriched.length,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        // Short cache: supply can change with each mint
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('[api/nft/limited-edition/species] Error:', err);
    const message = err instanceof Error ? err.message : 'Failed to fetch species catalogue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
