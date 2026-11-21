/**
 * Planting Region Types - Issue #1683
 *
 * Defines ecosystem types and planting regions for tree sponsorship
 */

export type EcosystemType = 'rainforest' | 'savannah' | 'mangrove' | 'mountain';

export interface PlantingRegion {
  id: string;
  name: string;
  country: string;
  ecosystemType: EcosystemType;
  coordinates: {
    lat: number;
    lng: number;
  };
  availableCapacity: number; // Number of trees that can be planted
  totalCapacity: number;
  description: string;
  imageUrl?: string;
}

export interface RegionSelection {
  regionId: string;
  ecosystemType: EcosystemType;
  treeCount: number;
}

export interface EcosystemAvailability {
  ecosystemType: EcosystemType;
  availableRegions: PlantingRegion[];
  totalAvailableCapacity: number;
  icon: string;
  color: string;
  description: string;
}
