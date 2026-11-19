/**
 * Mock Planting Regions Data - Issue #1683
 *
 * Sample planting regions with ecosystem types and availability
 */

import type { PlantingRegion, EcosystemAvailability } from '@/lib/types/planting-region';

export const mockPlantingRegions: PlantingRegion[] = [
  // Rainforest regions
  {
    id: 'rf-001',
    name: 'Amazon Basin',
    country: 'Brazil',
    ecosystemType: 'rainforest',
    coordinates: { lat: -3.4653, lng: -62.2159 },
    availableCapacity: 15000,
    totalCapacity: 50000,
    description: 'Tropical rainforest with high biodiversity',
    imageUrl: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 'rf-002',
    name: 'Congo Basin',
    country: 'DR Congo',
    ecosystemType: 'rainforest',
    coordinates: { lat: -0.2280, lng: 15.8277 },
    availableCapacity: 8000,
    totalCapacity: 30000,
    description: 'Second largest rainforest in the world',
    imageUrl: 'https://images.unsplash.com/photo-1542256844-7568536677eb?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 'rf-003',
    name: 'Borneo Rainforest',
    country: 'Indonesia',
    ecosystemType: 'rainforest',
    coordinates: { lat: 0.8, lng: 114.5 },
    availableCapacity: 5000,
    totalCapacity: 20000,
    description: 'Ancient rainforest with unique species',
    imageUrl: 'https://images.unsplash.com/photo-1596395819057-79dbf3020fe9?auto=format&fit=crop&q=80&w=400',
  },

  // Savannah regions
  {
    id: 'sv-001',
    name: 'Serengeti Plains',
    country: 'Tanzania',
    ecosystemType: 'savannah',
    coordinates: { lat: -2.1540, lng: 34.6857 },
    availableCapacity: 12000,
    totalCapacity: 40000,
    description: 'Vast grassland ecosystem',
    imageUrl: 'https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 'sv-002',
    name: 'African Savannah',
    country: 'Kenya',
    ecosystemType: 'savannah',
    coordinates: { lat: -1.2921, lng: 36.8219 },
    availableCapacity: 10000,
    totalCapacity: 35000,
    description: 'Iconic African savannah landscape',
    imageUrl: 'https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?auto=format&fit=crop&q=80&w=400',
  },

  // Mangrove regions
  {
    id: 'mg-001',
    name: 'Sundarbans',
    country: 'Bangladesh',
    ecosystemType: 'mangrove',
    coordinates: { lat: 21.9497, lng: 89.1833 },
    availableCapacity: 6000,
    totalCapacity: 15000,
    description: 'Largest mangrove forest in the world',
    imageUrl: 'https://images.unsplash.com/photo-1580746738099-2cb37e6b8e12?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 'mg-002',
    name: 'Florida Mangroves',
    country: 'USA',
    ecosystemType: 'mangrove',
    coordinates: { lat: 25.7617, lng: -80.1918 },
    availableCapacity: 4000,
    totalCapacity: 10000,
    description: 'Coastal mangrove ecosystem',
    imageUrl: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&q=80&w=400',
  },

  // Mountain regions
  {
    id: 'mt-001',
    name: 'Andes Mountains',
    country: 'Peru',
    ecosystemType: 'mountain',
    coordinates: { lat: -9.19, lng: -75.0152 },
    availableCapacity: 7000,
    totalCapacity: 25000,
    description: 'High-altitude reforestation zone',
    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 'mt-002',
    name: 'Himalayan Foothills',
    country: 'Nepal',
    ecosystemType: 'mountain',
    coordinates: { lat: 27.7172, lng: 85.3240 },
    availableCapacity: 5000,
    totalCapacity: 20000,
    description: 'Mountain ecosystem restoration',
    imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=400',
  },
];

export const ecosystemAvailability: EcosystemAvailability[] = [
  {
    ecosystemType: 'rainforest',
    availableRegions: mockPlantingRegions.filter(r => r.ecosystemType === 'rainforest'),
    totalAvailableCapacity: mockPlantingRegions
      .filter(r => r.ecosystemType === 'rainforest')
      .reduce((sum, r) => sum + r.availableCapacity, 0),
    icon: '🌴',
    color: '#22c55e',
    description: 'Tropical rainforests with high biodiversity and carbon sequestration',
  },
  {
    ecosystemType: 'savannah',
    availableRegions: mockPlantingRegions.filter(r => r.ecosystemType === 'savannah'),
    totalAvailableCapacity: mockPlantingRegions
      .filter(r => r.ecosystemType === 'savannah')
      .reduce((sum, r) => sum + r.availableCapacity, 0),
    icon: '🦁',
    color: '#eab308',
    description: 'Grassland ecosystems supporting diverse wildlife',
  },
  {
    ecosystemType: 'mangrove',
    availableRegions: mockPlantingRegions.filter(r => r.ecosystemType === 'mangrove'),
    totalAvailableCapacity: mockPlantingRegions
      .filter(r => r.ecosystemType === 'mangrove')
      .reduce((sum, r) => sum + r.availableCapacity, 0),
    icon: '🌊',
    color: '#0ea5e9',
    description: 'Coastal wetlands protecting shorelines and marine life',
  },
  {
    ecosystemType: 'mountain',
    availableRegions: mockPlantingRegions.filter(r => r.ecosystemType === 'mountain'),
    totalAvailableCapacity: mockPlantingRegions
      .filter(r => r.ecosystemType === 'mountain')
      .reduce((sum, r) => sum + r.availableCapacity, 0),
    icon: '⛰️',
    color: '#8b5cf6',
    description: 'High-altitude ecosystems preventing erosion and supporting water cycles',
  },
];

export function getRegionById(id: string): PlantingRegion | undefined {
  return mockPlantingRegions.find(r => r.id === id);
}

export function getRegionsByEcosystem(ecosystemType: string): PlantingRegion[] {
  return mockPlantingRegions.filter(r => r.ecosystemType === ecosystemType);
}

export function getRegionAvailability(regionId: string, treeCount: number): boolean {
  const region = getRegionById(regionId);
  return region ? region.availableCapacity >= treeCount : false;
}
