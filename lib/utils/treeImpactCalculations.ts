/**
 * Tree impact calculations based on FAO/IPCC Tier 1 biomass growth tables.
 * Data represents average annual values at maturity.
 */
import {
  type TreeSpecies,
  type TreeImpactMetrics,
  type TreeImpactCalculation,
} from '@/lib/types/tree-impact';

// 1 car emits ~4.6 tonnes CO2/year = 4600 kg/year
const KG_CO2_PER_CAR_YEAR = 4600;

// 1 shower uses ~60 liters
const LITERS_PER_SHOWER = 60;

export const TREE_SPECIES_DATA: Record<TreeSpecies, TreeImpactMetrics> = {
  teak: {
    species: 'teak',
    co2PerYear: 22,
    waterSavedPerYear: 15000,
    habitatRestoredM2: 25,
    oxygenProducedPerYear: 18,
    biodiversityScore: 72,
    maturityYears: 20,
    nativeTo: ['South Asia', 'Southeast Asia', 'East Africa'],
    description:
      'Teak is a large tropical hardwood prized for its durability. Mature trees sequester significant CO₂ and provide canopy habitat for diverse wildlife.',
  },
  moringa: {
    species: 'moringa',
    co2PerYear: 9,
    waterSavedPerYear: 8000,
    habitatRestoredM2: 10,
    oxygenProducedPerYear: 7,
    biodiversityScore: 58,
    maturityYears: 3,
    nativeTo: ['Sub-Saharan Africa', 'South Asia', 'Central America'],
    description:
      'Moringa is a fast-growing drought-tolerant tree often called the "miracle tree." It matures in just 3 years and provides nutritional and ecological benefits.',
  },
  eucalyptus: {
    species: 'eucalyptus',
    co2PerYear: 31,
    waterSavedPerYear: 20000,
    habitatRestoredM2: 15,
    oxygenProducedPerYear: 25,
    biodiversityScore: 45,
    maturityYears: 10,
    nativeTo: ['Australia', 'East Africa', 'South America'],
    description:
      'Eucalyptus is among the fastest-growing trees and sequesters CO₂ at a high rate. It thrives in diverse climates and is widely used in reforestation programs.',
  },
  mangrove: {
    species: 'mangrove',
    co2PerYear: 14,
    waterSavedPerYear: 12000,
    habitatRestoredM2: 50,
    oxygenProducedPerYear: 11,
    biodiversityScore: 95,
    maturityYears: 15,
    nativeTo: ['Coastal tropics', 'Southeast Asia', 'West Africa', 'Latin America'],
    description:
      'Mangroves are coastal ecosystems with extraordinary biodiversity value. They protect shorelines, nurture juvenile marine life, and store carbon in both biomass and sediment.',
  },
  oak: {
    species: 'oak',
    co2PerYear: 20,
    waterSavedPerYear: 18000,
    habitatRestoredM2: 30,
    oxygenProducedPerYear: 16,
    biodiversityScore: 88,
    maturityYears: 40,
    nativeTo: ['North America', 'Europe', 'East Asia'],
    description:
      'Oak trees support over 500 species of insects alone and provide habitat for hundreds of bird and mammal species. Their long lifespan means they sequester carbon for centuries.',
  },
  pine: {
    species: 'pine',
    co2PerYear: 15,
    waterSavedPerYear: 10000,
    habitatRestoredM2: 20,
    oxygenProducedPerYear: 12,
    biodiversityScore: 62,
    maturityYears: 25,
    nativeTo: ['North America', 'Europe', 'Asia', 'North Africa'],
    description:
      'Pine trees are hardy conifers that thrive in poor soils and cold climates. They stabilize hillsides, reduce erosion, and provide year-round habitat and food for wildlife.',
  },
  acacia: {
    species: 'acacia',
    co2PerYear: 12,
    waterSavedPerYear: 9000,
    habitatRestoredM2: 22,
    oxygenProducedPerYear: 10,
    biodiversityScore: 70,
    maturityYears: 15,
    nativeTo: ['Africa', 'Australia', 'South Asia', 'Middle East'],
    description:
      'Acacia trees are nitrogen-fixing pioneers that enrich degraded soils. They are vital in dryland restoration, rapidly establishing themselves and enabling other species to follow.',
  },
  bamboo: {
    species: 'bamboo',
    co2PerYear: 35,
    waterSavedPerYear: 25000,
    habitatRestoredM2: 8,
    oxygenProducedPerYear: 28,
    biodiversityScore: 65,
    maturityYears: 5,
    nativeTo: ['East Asia', 'South Asia', 'Southeast Asia', 'Latin America'],
    description:
      'Bamboo is technically a grass but sequesters CO₂ at extraordinary rates — among the highest of any plant. It reaches maturity in ~5 years and produces 35% more oxygen than equivalent trees.',
  },
};

/**
 * Calculate cumulative environmental impact for a given species, tree count, and time horizon.
 */
export function calculateTreeImpact(
  species: TreeSpecies,
  treeCount: number,
  years: number
): TreeImpactCalculation {
  const metrics = TREE_SPECIES_DATA[species];

  // Scale annual values by trees and years
  const totalCO2 = metrics.co2PerYear * treeCount * years;
  const totalWater = metrics.waterSavedPerYear * treeCount * years;
  // Habitat is per-tree, not cumulative over time (area restored stays the same)
  const totalHabitat = metrics.habitatRestoredM2 * treeCount;
  const totalOxygen = metrics.oxygenProducedPerYear * treeCount * years;

  // Equivalency translations
  const co2EquivalentCars = totalCO2 / KG_CO2_PER_CAR_YEAR;
  const waterEquivalentShowers = totalWater / LITERS_PER_SHOWER;

  return {
    metrics,
    treeCount,
    years,
    totalCO2,
    totalWater,
    totalHabitat,
    totalOxygen,
    co2EquivalentCars,
    waterEquivalentShowers,
  };
}

/** Format a large number with appropriate units (k, M) */
export function formatLargeNumber(value: number, decimals = 1): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(decimals)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(decimals)}k`;
  }
  return value.toFixed(decimals);
}
