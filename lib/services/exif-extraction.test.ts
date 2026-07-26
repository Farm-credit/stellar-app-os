import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EXIFExtractionService, extractEXIFMetadata } from './exif-extraction';

vi.mock('exifr', () => ({
  exifr: {
    parse: vi.fn(),
  },
}));

import { exifr } from 'exifr';

describe('EXIFExtractionService', () => {
  let service: EXIFExtractionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EXIFExtractionService();
  });

  describe('extractFromBuffer', () => {
    it('should extract EXIF metadata from valid image buffer', async () => {
      const mockBuffer = Buffer.from('test image data');
      const mockEXIFData = {
        latitude: 37.7749,
        longitude: -122.4194,
        Make: 'Canon',
        Model: 'EOS R5',
        DateTimeOriginal: '2024:01:15 10:30:00',
        ImageWidth: 4000,
        ImageHeight: 3000,
      };

      vi.mocked(exifr.parse).mockResolvedValue(mockEXIFData);

      const result = await service.extractFromBuffer(mockBuffer, 'image/jpeg');

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.gps).toEqual({
        latitude: 37.7749,
        longitude: -122.4194,
      });
      expect(result.metadata?.camera).toEqual({
        make: 'Canon',
        model: 'EOS R5',
      });
    });

    it('should reject files exceeding max size', async () => {
      const largeBuffer = Buffer.alloc(51 * 1024 * 1024);

      const result = await service.extractFromBuffer(largeBuffer, 'image/jpeg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed size');
    });

    it('should reject disallowed MIME types', async () => {
      const buffer = Buffer.from('test');
      const result = await service.extractFromBuffer(buffer, 'image/png');

      expect(result.success).toBe(false);
      expect(result.error).toContain('MIME type');
    });

    it('should handle missing EXIF data', async () => {
      vi.mocked(exifr.parse).mockResolvedValue(null);

      const result = await service.extractFromBuffer(Buffer.from('test'), 'image/jpeg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No EXIF data found');
    });

    it('should handle extraction errors', async () => {
      vi.mocked(exifr.parse).mockRejectedValue(new Error('Parse error'));

      const result = await service.extractFromBuffer(Buffer.from('test'), 'image/jpeg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('EXIF extraction failed');
    });

    it('should extract GPS coordinates when available', async () => {
      const mockEXIFData = {
        latitude: 40.7128,
        longitude: -74.0060,
        GPSAltitude: 10,
      };

      vi.mocked(exifr.parse).mockResolvedValue(mockEXIFData);

      const result = await service.extractFromBuffer(Buffer.from('test'), 'image/jpeg');

      expect(result.metadata?.gps).toEqual({
        latitude: 40.7128,
        longitude: -74.0060,
        altitude: 10,
      });
    });

    it('should validate GPS coordinates when enabled', async () => {
      const mockEXIFData = {
        latitude: 95,
        longitude: -122.4194,
      };

      vi.mocked(exifr.parse).mockResolvedValue(mockEXIFData);

      const result = await service.extractFromBuffer(Buffer.from('test'), 'image/jpeg');

      expect(result.success).toBe(true);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors?.length).toBeGreaterThan(0);
    });
  });

  describe('verifyTimestamp', () => {
    it('should verify valid timestamp', () => {
      const metadata = {
        timestamp: {
          dateTimeOriginal: new Date('2024-01-15T10:30:00'),
        },
      };

      const result = service.verifyTimestamp(metadata);

      expect(result.valid).toBe(true);
    });

    it('should reject future timestamps', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const metadata = {
        timestamp: {
          dateTimeOriginal: futureDate,
        },
      };

      const result = service.verifyTimestamp(metadata);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should reject timestamps exceeding max age', () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2);

      const metadata = {
        timestamp: {
          dateTimeOriginal: oldDate,
        },
      };

      const result = service.verifyTimestamp(metadata, { maxAge: 365 * 24 * 60 * 60 * 1000 });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum age');
    });

    it('should handle missing timestamp', () => {
      const metadata = {};

      const result = service.verifyTimestamp(metadata);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('No capture timestamp');
    });
  });

  describe('verifyCameraModel', () => {
    it('should verify matching camera model', () => {
      const metadata = {
        camera: {
          model: 'Canon EOS R5',
        },
      };

      const result = service.verifyCameraModel(metadata, 'EOS R5');

      expect(result.valid).toBe(true);
    });

    it('should reject non-matching camera model', () => {
      const metadata = {
        camera: {
          model: 'Nikon D850',
        },
      };

      const result = service.verifyCameraModel(metadata, 'EOS R5');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match');
    });

    it('should handle missing camera model', () => {
      const metadata = {};

      const result = service.verifyCameraModel(metadata, 'EOS R5');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('No camera model');
    });

    it('should pass when no expected model provided', () => {
      const metadata = {
        camera: {
          model: 'Canon EOS R5',
        },
      };

      const result = service.verifyCameraModel(metadata);

      expect(result.valid).toBe(true);
    });
  });

  describe('verifyGPSLocation', () => {
    it('should verify coordinates within bounds', () => {
      const metadata = {
        gps: {
          latitude: 37.7749,
          longitude: -122.4194,
        },
      };

      const result = service.verifyGPSLocation(metadata, {
        minLat: 30,
        maxLat: 40,
        minLon: -130,
        maxLon: -110,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject coordinates outside bounds', () => {
      const metadata = {
        gps: {
          latitude: 50,
          longitude: -122.4194,
        },
      };

      const result = service.verifyGPSLocation(metadata, {
        minLat: 30,
        maxLat: 40,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('above maximum');
    });

    it('should handle missing GPS data', () => {
      const metadata = {};

      const result = service.verifyGPSLocation(metadata, {});

      expect(result.valid).toBe(false);
      expect(result.error).toContain('No GPS coordinates');
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const customService = new EXIFExtractionService({
        maxFileSize: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg'],
      });

      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);

      expect(async () => {
        await customService.extractFromBuffer(largeBuffer, 'image/jpeg');
      }).rejects.toThrow();
    });

    it('should disable GPS extraction when configured', async () => {
      const noGPSService = new EXIFExtractionService({ extractGPS: false });
      const mockEXIFData = {
        latitude: 37.7749,
        longitude: -122.4194,
        Make: 'Canon',
      };

      vi.mocked(exifr.parse).mockResolvedValue(mockEXIFData);

      const result = await noGPSService.extractFromBuffer(Buffer.from('test'), 'image/jpeg');

      expect(result.metadata?.gps).toBeUndefined();
    });
  });
});

describe('extractEXIFMetadata convenience function', () => {
  it('should use singleton service', async () => {
    const mockBuffer = Buffer.from('test');
    const mockEXIFData = {
      Make: 'Canon',
      Model: 'EOS R5',
    };

    vi.mocked(exifr.parse).mockResolvedValue(mockEXIFData);

    const result = await extractEXIFMetadata(mockBuffer, 'image/jpeg');

    expect(result.success).toBe(true);
  });
});
