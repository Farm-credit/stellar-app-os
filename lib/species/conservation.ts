import { TREE_SPECIES, type SpeciesInfo } from '@/lib/constants/species';

/** IUCN Red List categories relevant to the platform's species catalogue. */
export type IucnCategory = 'CR' | 'EN' | 'VU' | 'NT' | 'LC' | 'NE';

export const IUCN_CATEGORY_LABELS: Record<IucnCategory, string> = {
  CR: 'Critically Endangered',
  EN: 'Endangered',
  VU: 'Vulnerable',
  NT: 'Near Threatened',
  LC: 'Least Concern',
  NE: 'Not Evaluated',
};

/** Categories that qualify a species for the "Endangered Species" priority list. */
export const PRIORITY_CATEGORIES: readonly IucnCategory[] = ['CR', 'EN', 'VU'];

/** Lower rank = more urgent. Used to order the prioritised planting list. */
const CATEGORY_RANK: Record<IucnCategory, number> = {
  CR: 0,
  EN: 1,
  VU: 2,
  NT: 3,
  LC: 4,
  NE: 5,
};

export interface ConservationProfile {
  slug: string;
  scientificName: string;
  category: IucnCategory;
  /** Why this species needs priority funding. Shown on the card for threatened species. */
  priorityReason?: string;
}

/**
 * Conservation data per species slug. Categories follow the most recent IUCN
 * Red List assessment known to the platform team and should be re-checked
 * against the Red List when the catalogue is refreshed.
 */
export const CONSERVATION_PROFILES: ConservationProfile[] = [
  {
    slug: 'teak',
    scientificName: 'Tectona grandis',
    category: 'EN',
    priorityReason:
      'Natural teak forests have shrunk sharply through logging and conversion to farmland. Funding native-range restoration protects the remaining wild gene pool.',
  },
  {
    slug: 'mahogany',
    scientificName: 'Khaya senegalensis',
    category: 'VU',
    priorityReason:
      'Overharvested for timber across the Sahel and West Africa. Wild stands are thinning faster than they regenerate.',
  },
  {
    slug: 'shea',
    scientificName: 'Vitellaria paradoxa',
    category: 'VU',
    priorityReason:
      'Shea parklands are ageing with little natural regeneration, putting both the species and the livelihoods that depend on it at risk.',
  },
  { slug: 'iroko', scientificName: 'Milicia excelsa', category: 'NT' },
  { slug: 'baobab', scientificName: 'Adansonia digitata', category: 'LC' },
  { slug: 'neem', scientificName: 'Azadirachta indica', category: 'LC' },
  { slug: 'mangrove', scientificName: 'Rhizophora mangle', category: 'LC' },
  { slug: 'cashew', scientificName: 'Anacardium occidentale', category: 'LC' },
  { slug: 'locust_bean', scientificName: 'Parkia biglobosa', category: 'LC' },
  { slug: 'moringa', scientificName: 'Moringa oleifera', category: 'NE' },
  { slug: 'acacia', scientificName: 'Acacia spp.', category: 'NE' },
  { slug: 'eucalyptus', scientificName: 'Eucalyptus spp.', category: 'NE' },
  { slug: 'bamboo', scientificName: 'Phyllostachys edulis', category: 'NE' },
  { slug: 'cedar', scientificName: 'Khaya ivorensis', category: 'NE' },
  { slug: 'pine', scientificName: 'Pinus caribaea', category: 'NE' },
];

const PROFILE_BY_SLUG = new Map(CONSERVATION_PROFILES.map((p) => [p.slug, p]));

export interface SpeciesWithConservation extends SpeciesInfo {
  scientificName: string;
  category: IucnCategory;
  categoryLabel: string;
  isEndangered: boolean;
  priorityReason?: string;
  redListUrl: string;
}

export function isPriorityCategory(category: IucnCategory): boolean {
  return PRIORITY_CATEGORIES.includes(category);
}

/** Link to the IUCN Red List species search for a scientific name. */
export function buildRedListUrl(scientificName: string): string {
  const query = encodeURIComponent(scientificName);
  return `https://www.iucnredlist.org/search?query=${query}&searchType=species`;
}

export function getSpeciesWithConservation(): SpeciesWithConservation[] {
  return TREE_SPECIES.map((species) => {
    const profile = PROFILE_BY_SLUG.get(species.slug);
    const category = profile?.category ?? 'NE';
    const scientificName = profile?.scientificName ?? species.name;
    return {
      ...species,
      scientificName,
      category,
      categoryLabel: IUCN_CATEGORY_LABELS[category],
      isEndangered: isPriorityCategory(category),
      priorityReason: profile?.priorityReason,
      redListUrl: buildRedListUrl(scientificName),
    };
  });
}

/** Threatened species, most urgent category first, then by name. */
export function getPrioritisedPlantingList(): SpeciesWithConservation[] {
  return getSpeciesWithConservation()
    .filter((s) => s.isEndangered)
    .sort(
      (a, b) =>
        CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || a.name.localeCompare(b.name)
    );
}
