import type { PlantingLocation } from '@/lib/db/schema';

/**
 * Mock planting locations used for UI development and testing when the
 * database is not available. Each location is geo-realistic (coordinates
 * fall inside the stated region) and references species slugs defined in
 * lib/constants/species.ts so downstream lookups succeed.
 */
export const MOCK_PLANTING_LOCATIONS: PlantingLocation[] = [
  {
    id: 1,
    name: 'Kano Savanna Restoration',
    description:
      'Community-led reforestation of degraded Sahelian savanna in northern Nigeria. Partnering with smallholder farmers to establish agroforestry plots that improve soil health and provide fodder.',
    latitude: 12.0022,
    longitude: 8.5911,
    region: 'Sub-Saharan Africa',
    climate: 'Arid',
    species: ['acacia', 'neem', 'baobab', 'moringa', 'shea'],
    availableCapacity: 15000,
  },
  {
    id: 2,
    name: 'Volta Delta Mangrove Recovery',
    description:
      'Coastal mangrove restoration along the Volta River estuary. Mangroves protect shorelines from erosion, sequester carbon at 2–4× the rate of tropical forests, and support artisanal fisheries.',
    latitude: 5.6312,
    longitude: 0.0483,
    region: 'Sub-Saharan Africa',
    climate: 'Tropical',
    species: ['mangrove', 'cashew'],
    availableCapacity: 8200,
  },
  {
    id: 3,
    name: 'Aberdare Highlands Watershed',
    description:
      'Reforestation of degraded upper watershed areas in the Aberdare Range, a critical water tower for Nairobi and surrounding farmland. Mixed indigenous plantings stabilize soil and regulate river flow.',
    latitude: -0.4167,
    longitude: 36.6833,
    region: 'Sub-Saharan Africa',
    climate: 'Temperate',
    species: ['cedar', 'pine', 'eucalyptus', 'bamboo'],
    availableCapacity: 22400,
  },
  {
    id: 4,
    name: 'Brazilian Atlantic Corridor',
    description:
      'Restoring the highly threatened Atlantic Forest biome along the eastern coast of Brazil. Connecting fragmented forest patches to protect endemic species and secure freshwater springs.',
    latitude: -12.9714,
    longitude: -38.5014,
    region: 'Latin America',
    climate: 'Tropical',
    species: ['mahogany', 'iroko', 'teak', 'bamboo'],
    availableCapacity: 31000,
  },
  {
    id: 5,
    name: 'Pacific Northwest Riparian Buffer',
    description:
      'Riparian reforestation along rivers in Oregon and Washington. Planting native hardwoods and conifers to shade streams, reduce water temperatures, and improve salmon spawning habitat.',
    latitude: 45.5152,
    longitude: -122.6784,
    region: 'North America',
    climate: 'Temperate',
    species: ['pine', 'cedar', 'bamboo'],
    availableCapacity: 6700,
  },
  {
    id: 6,
    name: 'Indonesian Peatland Re-greening',
    description:
      'Rewetting and reforesting degraded peatlands in Sumatra. Preventing peat fires and carbon release while restoring habitat for orangutans and other endangered species.',
    latitude: -0.7893,
    longitude: 113.9213,
    region: 'Southeast Asia',
    climate: 'Tropical',
    species: ['mangrove', 'teak', 'eucalyptus'],
    availableCapacity: 19500,
  },
  {
    id: 7,
    name: 'Mediterranean Dryland Restoration',
    description:
      'Restoring dryland forests in the Iberian interior using drought-tolerant native species. Combating desertification and supporting cork oak and olive agroforestry livelihoods.',
    latitude: 39.4699,
    longitude: -6.3763,
    region: 'Europe',
    climate: 'Arid',
    species: ['pine', 'cedar', 'locust_bean'],
    availableCapacity: 4300,
  },
  {
    id: 8,
    name: 'Himalayan Foothill Agroforestry',
    description:
      'Slope stabilization and agroforestry plantings in the Uttarakhand foothills. Mixed species plantings reduce landslide risk while producing fruit, fodder, and medicinal products for villages.',
    latitude: 30.3165,
    longitude: 78.0322,
    region: 'South Asia',
    climate: 'Temperate',
    species: ['teak', 'bamboo', 'neem', 'moringa', 'cashew'],
    availableCapacity: 11800,
  },
];

export function getMockPlantingLocations(): PlantingLocation[] {
  return MOCK_PLANTING_LOCATIONS;
}

export interface PlantingLocationFilterState {
  regions: string[];
  climates: string[];
  species: string[];
}

export function filterPlantingLocations(
  locations: PlantingLocation[],
  filters: PlantingLocationFilterState
): PlantingLocation[] {
  return locations.filter((loc) => {
    if (filters.regions.length > 0 && !filters.regions.includes(loc.region)) return false;
    if (filters.climates.length > 0 && !filters.climates.includes(loc.climate)) return false;
    if (filters.species.length > 0 && !loc.species.some((s) => filters.species.includes(s))) {
      return false;
    }
    return true;
  });
}

export function getFilterOptions(locations: PlantingLocation[]): {
  regionOptions: string[];
  climateOptions: string[];
  speciesOptions: string[];
} {
  return {
    regionOptions: [...new Set(locations.map((l) => l.region))].sort(),
    climateOptions: [...new Set(locations.map((l) => l.climate))].sort(),
    speciesOptions: [...new Set(locations.flatMap((l) => l.species))].sort(),
  };
}
