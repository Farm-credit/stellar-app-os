/**
 * Mock Drone Imagery Data - Issue #1680
 *
 * Sample drone survey imagery data for forest monitoring
 */

import type { DroneImage } from '@/lib/types/drone-imagery';

export const mockDroneImages: DroneImage[] = [
  {
    id: 'di-001',
    projectId: 'proj-001',
    imageUrl: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&q=80&w=2000',
    thumbnailUrl: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&q=80&w=400',
    capturedAt: '2026-10-15T10:30:00Z',
    uploadedAt: '2026-10-15T14:00:00Z',
    uploadedBy: 'partner-001',
    geotag: {
      latitude: -3.4653,
      longitude: -62.2159,
      altitude: 150,
    },
    metadata: {
      droneModel: 'DJI Phantom 4 Pro',
      camera: 'FC6310',
      resolution: '4K',
      flightAltitude: 120,
      coverageArea: 50000,
    },
    measurements: {
      treeCount: 2450,
      canopyCover: 78,
      avgHeight: 12.5,
    },
  },
  {
    id: 'di-002',
    projectId: 'proj-001',
    imageUrl: 'https://images.unsplash.com/photo-1542256844-7568536677eb?auto=format&fit=crop&q=80&w=2000',
    thumbnailUrl: 'https://images.unsplash.com/photo-1542256844-7568536677eb?auto=format&fit=crop&q=80&w=400',
    capturedAt: '2026-09-20T09:15:00Z',
    uploadedAt: '2026-09-20T12:30:00Z',
    uploadedBy: 'partner-001',
    geotag: {
      latitude: -3.4700,
      longitude: -62.2200,
      altitude: 145,
    },
    metadata: {
      droneModel: 'DJI Mavic 3',
      camera: 'Hasselblad L2D-20c',
      resolution: '5.4K',
      flightAltitude: 100,
      coverageArea: 45000,
    },
    measurements: {
      treeCount: 2180,
      canopyCover: 75,
      avgHeight: 11.8,
    },
  },
  {
    id: 'di-003',
    projectId: 'proj-001',
    imageUrl: 'https://images.unsplash.com/photo-1596395819057-79dbf3020fe9?auto=format&fit=crop&q=80&w=2000',
    thumbnailUrl: 'https://images.unsplash.com/photo-1596395819057-79dbf3020fe9?auto=format&fit=crop&q=80&w=400',
    capturedAt: '2026-08-10T11:00:00Z',
    uploadedAt: '2026-08-10T15:00:00Z',
    uploadedBy: 'partner-002',
    geotag: {
      latitude: -3.4650,
      longitude: -62.2180,
      altitude: 155,
    },
    metadata: {
      droneModel: 'Autel EVO II',
      camera: '1/2\" CMOS',
      resolution: '8K',
      flightAltitude: 130,
      coverageArea: 48000,
    },
    measurements: {
      treeCount: 2320,
      canopyCover: 76,
      avgHeight: 12.2,
    },
  },
];

export function getDroneImagesByProject(projectId: string): DroneImage[] {
  return mockDroneImages.filter(img => img.projectId === projectId);
}

export function getDroneImageById(id: string): DroneImage | undefined {
  return mockDroneImages.find(img => img.id === id);
}
