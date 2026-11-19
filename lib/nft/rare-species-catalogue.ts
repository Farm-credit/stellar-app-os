/**
 * Rare species catalogue for limited-edition NFTs (#1162).
 *
 * This static catalogue defines the rare, endangered, and heritage-variety
 * tree species eligible for limited-edition collectible NFTs. Each entry
 * sets the maximum supply cap that is enforced by the mint API.
 *
 * Sources:
 *   - IUCN Red List of Threatened Species (iucnredlist.org)
 *   - FAO Global Forest Resources Assessment (2020)
 *   - Platform conservation partnerships
 */

import type { RareSpeciesEntry, NftRarityTier, IucnStatus } from '@/lib/types/limited-edition-nft';

// ── Supply caps per rarity tier ───────────────────────────────────────────────
// These are platform-level defaults. Individual species may override them.
export const SUPPLY_CAPS: Record<NftRarityTier, number> = {
  legendary: 10,
  epic: 50,
  rare: 250,
  uncommon: 1000,
};

// ── Catalogue ─────────────────────────────────────────────────────────────────

export const RARE_SPECIES_CATALOGUE: RareSpeciesEntry[] = [
  // ── Legendary (≤ 10) ─────────────────────────────────────────────────────
  {
    speciesSlug: 'african-blackwood',
    commonName: 'African Blackwood',
    scientificName: 'Dalbergia melanoxylon',
    iucnStatus: 'VU' as IucnStatus,
    rarity: 'legendary',
    maxSupply: 10,
    lore: 'The holy grail of tonewoods, prized by luthiers for centuries. Severe over-harvesting has reduced wild populations by over 50 % in three generations. Each planted specimen is a living instrument waiting to be born.',
    imageUri: 'ipfs://QmAfricanBlackwoodPlaceholder',
    addedAt: '2026-01-01T00:00:00Z',
  },
  {
    speciesSlug: 'dragon-blood',
    commonName: 'Dragon Blood Tree',
    scientificName: 'Dracaena cinnabari',
    iucnStatus: 'VU' as IucnStatus,
    rarity: 'legendary',
    maxSupply: 10,
    lore: 'Endemic to Socotra Island, this otherworldly umbrella-shaped tree bleeds crimson resin. Climate change and overgrazing threaten its near-mythological groves. Fewer than 5 000 mature specimens remain.',
    imageUri: 'ipfs://QmDragonBloodPlaceholder',
    addedAt: '2026-01-01T00:00:00Z',
  },

  // ── Epic (≤ 50) ──────────────────────────────────────────────────────────
  {
    speciesSlug: 'african-zebrawood',
    commonName: 'African Zebrawood',
    scientificName: 'Microberlinia bisulcata',
    iucnStatus: 'EN' as IucnStatus,
    rarity: 'epic',
    maxSupply: 50,
    lore: 'Named for its dramatic interlocking stripe pattern, this Cameroonian giant is critically threatened by illegal logging. Ancient specimens take 200+ years to achieve their full width.',
    imageUri: 'ipfs://QmZebrawoodPlaceholder',
    addedAt: '2026-01-01T00:00:00Z',
  },
  {
    speciesSlug: 'bois-dentelle',
    commonName: "Bois Dentelle",
    scientificName: 'Elaeocarpus bojeri',
    iucnStatus: 'CR' as IucnStatus,
    rarity: 'epic',
    maxSupply: 50,
    lore: 'One of the rarest trees on Earth — only two known wild specimens remain on Mauritius\'s Black River Gorges ridge. Lace-like white blossoms belie the urgency of its survival story.',
    imageUri: 'ipfs://QmBoisDentellePlaceholder',
    addedAt: '2026-01-01T00:00:00Z',
  },
  {
    speciesSlug: 'century-baobab',
    commonName: 'Grandidier\'s Baobab',
    scientificName: 'Adansonia grandidieri',
    iucnStatus: 'EN' as IucnStatus,
    rarity: 'epic',
    maxSupply: 50,
    lore: 'Madagascar\'s cathedral tree — towering, barrel-trunked, and endemic to a narrow coastal strip. Climate-driven droughts and land conversion have pushed this ancient species to the edge.',
    imageUri: 'ipfs://QmGrandidierBaobabPlaceholder',
    addedAt: '2026-01-01T00:00:00Z',
  },

  // ── Rare (≤ 250) ──────────────────────────────────────────────────────────
  {
    speciesSlug: 'african-rosewood',
    commonName: 'African Rosewood',
    scientificName: 'Pterocarpus erinaceus',
    iucnStatus: 'EN' as IucnStatus,
    rarity: 'rare',
    maxSupply: 250,
    lore: 'West Africa\'s most trafficked tree — stripped from forests at an industrial scale to feed Chinese furniture markets. Its recovery is a test of whether trade policy can outrun the chainsaw.',
    imageUri: 'ipfs://QmAfricanRosewoodPlaceholder',
    addedAt: '2026-01-15T00:00:00Z',
  },
  {
    speciesSlug: 'iroko',
    commonName: 'African Teak (Iroko)',
    scientificName: 'Milicia excelsa',
    iucnStatus: 'VU' as IucnStatus,
    rarity: 'rare',
    maxSupply: 250,
    lore: 'Sacred to Yoruba culture and famed by craftsmen worldwide, Iroko\'s slow growth and premium timber value make it a prime target. Planting one is an act of intergenerational trust.',
    imageUri: 'ipfs://QmIrokoPlaceholder',
    addedAt: '2026-01-15T00:00:00Z',
  },
  {
    speciesSlug: 'sapele',
    commonName: 'Sapele',
    scientificName: 'Entandrophragma cylindricum',
    iucnStatus: 'VU' as IucnStatus,
    rarity: 'rare',
    maxSupply: 250,
    lore: 'A towering rainforest emergent whose interlocked grain produces the ribbon figure prized in premium furniture and guitars. Selective logging has hollowed out its old-growth presence.',
    imageUri: 'ipfs://QmSapelePlaceholder',
    addedAt: '2026-01-15T00:00:00Z',
  },

  // ── Uncommon (≤ 1 000) ────────────────────────────────────────────────────
  {
    speciesSlug: 'obeche',
    commonName: 'African Whitewood (Obeche)',
    scientificName: 'Triplochiton scleroxylon',
    iucnStatus: 'NT' as IucnStatus,
    rarity: 'uncommon',
    maxSupply: 1000,
    lore: 'A keystone species of West African moist forests, Obeche supports hundreds of epiphytic plants and cavity-nesting birds. Near-threatened but rebounding where community forestry has taken hold.',
    imageUri: 'ipfs://QmObechePlaceholder',
    addedAt: '2026-02-01T00:00:00Z',
  },
  {
    speciesSlug: 'cordia-africana',
    commonName: 'Large-leaved Cordia',
    scientificName: 'Cordia africana',
    iucnStatus: 'NT' as IucnStatus,
    rarity: 'uncommon',
    maxSupply: 1000,
    lore: 'An Ethiopian heritage variety used for centuries in traditional furniture making and agroforestry. Deforestation has reduced coverage by 80 % since 1960 — but farmers who plant it report transformed livelihoods.',
    imageUri: 'ipfs://QmCordiaAfricanaPlaceholder',
    addedAt: '2026-02-01T00:00:00Z',
  },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

const CATALOGUE_INDEX = new Map(
  RARE_SPECIES_CATALOGUE.map((s) => [s.speciesSlug, s])
);

export function getRareSpeciesBySlug(slug: string): RareSpeciesEntry | undefined {
  return CATALOGUE_INDEX.get(slug);
}

export function isRareSpecies(slug: string): boolean {
  return CATALOGUE_INDEX.has(slug);
}

export function getRareSpeciesByRarity(rarity: NftRarityTier): RareSpeciesEntry[] {
  return RARE_SPECIES_CATALOGUE.filter((s) => s.rarity === rarity);
}

export function getAllRareSpecies(): RareSpeciesEntry[] {
  return [...RARE_SPECIES_CATALOGUE];
}
