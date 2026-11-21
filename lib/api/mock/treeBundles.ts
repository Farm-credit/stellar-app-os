import type { TreeBundle } from '@/lib/types/tree-bundle';

/**
 * Curated tree bundle catalog.
 *
 * Pricing rule: bundles are discounted 15–25 % vs. the per-tree rate of $12/tree.
 */
export const MOCK_BUNDLES: TreeBundle[] = [
  {
    id: 'rainforest-5',
    name: 'Rainforest Bundle',
    tagline: 'Five trees across three tropical species',
    description:
      'Restore tropical biodiversity with a mix of fast-growing Bamboo, water-purifying Mangrove, and long-lived African Mahogany. Each tree receives its own trackable ID and GPS-stamped planter updates.',
    slots: [
      {
        species: 'Bamboo (Moso)',
        quantity: 2,
        totalCo2KgPerYear: 70,
        region: 'Cross River, Nigeria',
      },
      {
        species: 'Mangrove',
        quantity: 2,
        totalCo2KgPerYear: 28,
        region: 'Greater Accra, Ghana',
      },
      {
        species: 'African Mahogany',
        quantity: 1,
        totalCo2KgPerYear: 18,
        region: 'Volta Region, Ghana',
      },
    ],
    treeCount: 5,
    retailPriceUsd: 60,
    bundlePriceUsd: 49,
    discountPercent: 18,
    totalCo2KgPerYear: 116,
    icon: '🌿',
    gradientClass: 'from-emerald-700 to-teal-600',
    badge: 'Popular',
  },
  {
    id: 'family-forest-10',
    name: 'Family Forest',
    tagline: 'Ten trees — one for every family member',
    description:
      'Plant a living legacy. This bundle spreads ten trees across four species and three regions, giving your family a personalised forest they can track for generations. Each tree has its own profile page with photos and CO₂ data.',
    slots: [
      {
        species: 'Teak',
        quantity: 3,
        totalCo2KgPerYear: 66,
        region: 'Kano, Nigeria',
      },
      {
        species: 'Moringa',
        quantity: 3,
        totalCo2KgPerYear: 27,
        region: 'Kano, Nigeria',
      },
      {
        species: 'Eucalyptus',
        quantity: 2,
        totalCo2KgPerYear: 62,
        region: 'Kaduna, Nigeria',
      },
      {
        species: 'Neem',
        quantity: 2,
        totalCo2KgPerYear: 26,
        region: 'Borno, Nigeria',
      },
    ],
    treeCount: 10,
    retailPriceUsd: 120,
    bundlePriceUsd: 95,
    discountPercent: 21,
    totalCo2KgPerYear: 181,
    icon: '👨‍👩‍👧‍👦',
    gradientClass: 'from-stellar-purple to-stellar-blue',
    badge: 'Best Value',
  },
  {
    id: 'carbon-booster-20',
    name: 'Carbon Booster',
    tagline: 'Maximum CO₂ impact — 20 high-sequestering trees',
    description:
      'Engineered for carbon impact. Every tree in this bundle is a top-tier sequesterer: Bamboo captures CO₂ five times faster than average, while Caribbean Pine and Eucalyptus provide deep long-term storage. Ideal for businesses offsetting a flight or a team away-day.',
    slots: [
      {
        species: 'Bamboo (Moso)',
        quantity: 8,
        totalCo2KgPerYear: 280,
        region: 'Cross River, Nigeria',
      },
      {
        species: 'Eucalyptus',
        quantity: 6,
        totalCo2KgPerYear: 186,
        region: 'Kaduna, Nigeria',
      },
      {
        species: 'Caribbean Pine',
        quantity: 6,
        totalCo2KgPerYear: 150,
        region: 'Liberia Highlands',
      },
    ],
    treeCount: 20,
    retailPriceUsd: 240,
    bundlePriceUsd: 185,
    discountPercent: 23,
    totalCo2KgPerYear: 616,
    icon: '🚀',
    gradientClass: 'from-stellar-blue to-stellar-cyan',
    badge: 'High Impact',
  },
  {
    id: 'agroforestry-starter',
    name: 'Agroforestry Starter',
    tagline: 'Food + forest in one gift',
    description:
      'Agroforestry trees deliver food security and carbon sequestration side-by-side. Moringa provides nutrition within months; Shea and Cashew support local livelihoods. A thoughtful gift for someone who cares about both people and planet.',
    slots: [
      {
        species: 'Moringa',
        quantity: 2,
        totalCo2KgPerYear: 18,
        region: 'Kano, Nigeria',
      },
      {
        species: 'Shea',
        quantity: 2,
        totalCo2KgPerYear: 14,
        region: 'Northern Ghana',
      },
      {
        species: 'Cashew',
        quantity: 2,
        totalCo2KgPerYear: 20,
        region: 'Brong-Ahafo, Ghana',
      },
      {
        species: 'African Locust Bean',
        quantity: 1,
        totalCo2KgPerYear: 12,
        region: 'Northern Ghana',
      },
    ],
    treeCount: 7,
    retailPriceUsd: 84,
    bundlePriceUsd: 69,
    discountPercent: 18,
    totalCo2KgPerYear: 64,
    icon: '🌾',
    gradientClass: 'from-amber-600 to-stellar-green',
  },
  {
    id: 'mangrove-coast',
    name: 'Mangrove Coast',
    tagline: 'Protect coastlines — six mangrove trees',
    description:
      'Mangroves are among the most valuable ecosystems on Earth: they shelter coastlines from storms, provide nursery habitat for fish, and sequester carbon at twice the rate of inland forests. Each tree is GPS-verified by a coastal planter.',
    slots: [
      {
        species: 'Mangrove',
        quantity: 6,
        totalCo2KgPerYear: 84,
        region: 'Greater Accra, Ghana',
      },
    ],
    treeCount: 6,
    retailPriceUsd: 72,
    bundlePriceUsd: 59,
    discountPercent: 18,
    totalCo2KgPerYear: 84,
    icon: '🌊',
    gradientClass: 'from-cyan-700 to-teal-500',
    badge: 'Eco Focus',
  },
];

/**
 * Return all available bundles.
 */
export function getMockBundles(): TreeBundle[] {
  return MOCK_BUNDLES;
}

/**
 * Look up a single bundle by ID. Returns undefined if not found.
 */
export function getMockBundleById(id: string): TreeBundle | undefined {
  return MOCK_BUNDLES.find((b) => b.id === id);
}
