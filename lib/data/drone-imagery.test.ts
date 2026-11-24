/**
 * Tests for Drone Imagery Data - Issue #1680
 */

import { describe, it, expect } from 'vitest';
import {
  mockDroneImages,
  getDroneImagesByProject,
  getDroneImageById,
} from './drone-imagery';

describe('mockDroneImages', () => {
  it('has valid image data structure', () => {
    mockDroneImages.forEach(image => {
      expect(image.id).toBeDefined();
      expect(image.projectId).toBeDefined();
      expect(image.imageUrl).toBeDefined();
      expect(image.thumbnailUrl).toBeDefined();
      expect(image.capturedAt).toBeDefined();
      expect(image.uploadedAt).toBeDefined();
      expect(image.uploadedBy).toBeDefined();
      expect(image.geotag).toBeDefined();
      expect(image.geotag.latitude).toBeDefined();
      expect(image.geotag.longitude).toBeDefined();
      expect(image.metadata).toBeDefined();
      expect(image.metadata.droneModel).toBeDefined();
      expect(image.metadata.camera).toBeDefined();
      expect(image.metadata.resolution).toBeDefined();
      expect(image.metadata.flightAltitude).toBeDefined();
      expect(image.metadata.coverageArea).toBeDefined();
    });
  });

  it('has unique image IDs', () => {
    const ids = mockDroneImages.map(img => img.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('has valid geotag coordinates', () => {
    mockDroneImages.forEach(image => {
      expect(image.geotag.latitude).toBeGreaterThanOrEqual(-90);
      expect(image.geotag.latitude).toBeLessThanOrEqual(90);
      expect(image.geotag.longitude).toBeGreaterThanOrEqual(-180);
      expect(image.geotag.longitude).toBeLessThanOrEqual(180);
    });
  });

  it('has valid altitude values', () => {
    mockDroneImages.forEach(image => {
      if (image.geotag.altitude) {
        expect(image.geotag.altitude).toBeGreaterThan(0);
      }
    });
  });

  it('has valid metadata values', () => {
    mockDroneImages.forEach(image => {
      expect(image.metadata.flightAltitude).toBeGreaterThan(0);
      expect(image.metadata.coverageArea).toBeGreaterThan(0);
      expect(['4K', '5.4K', '8K'].includes(image.metadata.resolution)).toBe(true);
    });
  });

  it('has optional measurements', () => {
    const imagesWithMeasurements = mockDroneImages.filter(img => img.measurements);
    imagesWithMeasurements.forEach(image => {
      expect(image.measurements).toBeDefined();
      if (image.measurements) {
        if (image.measurements.treeCount) {
          expect(image.measurements.treeCount).toBeGreaterThan(0);
        }
        if (image.measurements.canopyCover) {
          expect(image.measurements.canopyCover).toBeGreaterThanOrEqual(0);
          expect(image.measurements.canopyCover).toBeLessThanOrEqual(100);
        }
        if (image.measurements.avgHeight) {
          expect(image.measurements.avgHeight).toBeGreaterThan(0);
        }
      }
    });
  });
});

describe('getDroneImagesByProject', () => {
  it('returns correct images for valid project ID', () => {
    const images = getDroneImagesByProject('proj-001');
    expect(images).toHaveLength(3);
    images.forEach(image => {
      expect(image.projectId).toBe('proj-001');
    });
  });

  it('returns empty array for invalid project ID', () => {
    const images = getDroneImagesByProject('invalid-project');
    expect(images).toEqual([]);
  });

  it('returns images in chronological order by captured date', () => {
    const images = getDroneImagesByProject('proj-001');
    const dates = images.map(img => new Date(img.capturedAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
    }
  });
});

describe('getDroneImageById', () => {
  it('returns correct image for valid ID', () => {
    const image = getDroneImageById('di-001');
    expect(image).toBeDefined();
    expect(image?.id).toBe('di-001');
    expect(image?.projectId).toBe('proj-001');
  });

  it('returns undefined for invalid ID', () => {
    const image = getDroneImageById('invalid-id');
    expect(image).toBeUndefined();
  });
});
