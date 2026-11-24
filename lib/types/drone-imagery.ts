/**
 * Drone Imagery Types - Issue #1680
 *
 * Defines drone survey imagery data structures for forest monitoring
 */

export interface DroneImage {
  id: string;
  projectId: string;
  imageUrl: string;
  thumbnailUrl: string;
  capturedAt: string; // ISO date string
  uploadedAt: string; // ISO date string
  uploadedBy: string; // Partner organization ID
  geotag: {
    latitude: number;
    longitude: number;
    altitude?: number; // meters above sea level
  };
  metadata: {
    droneModel: string;
    camera: string;
    resolution: string; // e.g., "4K", "8K"
    flightAltitude: number; // meters
    coverageArea: number; // square meters
  };
  measurements?: {
    treeCount?: number;
    canopyCover?: number; // percentage
    avgHeight?: number; // meters
  };
}

export interface DroneImageUpload {
  projectId: string;
  imageFile: File;
  geotag: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  metadata: {
    droneModel: string;
    camera: string;
    resolution: string;
    flightAltitude: number;
    coverageArea: number;
  };
}

export interface DroneMeasurement {
  type: 'distance' | 'area' | 'height';
  value: number;
  unit: string;
  points: Array<{ x: number; y: number }>;
  label?: string;
}
