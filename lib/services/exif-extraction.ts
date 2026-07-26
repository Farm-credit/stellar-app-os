import { exifr } from 'exifr';

export interface GPSCoordinates {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
}

export interface CameraInfo {
  make?: string;
  model?: string;
  software?: string;
  lensModel?: string;
  focalLength?: number;
  iso?: number;
  aperture?: number;
  shutterSpeed?: string;
}

export interface TimestampInfo {
  dateTimeOriginal?: Date;
  dateTimeDigitized?: Date;
  dateTime?: Date;
  offsetTime?: string;
  offsetTimeOriginal?: string;
}

export interface EXIFMetadata {
  gps?: GPSCoordinates;
  camera?: CameraInfo;
  timestamp?: TimestampInfo;
  imageWidth?: number;
  imageHeight?: number;
  orientation?: number;
  fileSize?: number;
  mimeType?: string;
}

export interface EXIFExtractionConfig {
  extractGPS?: boolean;
  extractCamera?: boolean;
  extractTimestamp?: boolean;
  extractImageDimensions?: boolean;
  validateCoordinates?: boolean;
  maxFileSize?: number;
  allowedMimeTypes?: string[];
}

export interface EXIFExtractionResult {
  success: boolean;
  metadata?: EXIFMetadata;
  error?: string;
  validationErrors?: string[];
}

export class EXIFExtractionService {
  private config: Required<EXIFExtractionConfig>;

  constructor(config: EXIFExtractionConfig = {}) {
    this.config = {
      extractGPS: config.extractGPS ?? true,
      extractCamera: config.extractCamera ?? true,
      extractTimestamp: config.extractTimestamp ?? true,
      extractImageDimensions: config.extractImageDimensions ?? true,
      validateCoordinates: config.validateCoordinates ?? true,
      maxFileSize: config.maxFileSize ?? 50 * 1024 * 1024,
      allowedMimeTypes: config.allowedMimeTypes ?? [
        'image/jpeg',
        'image/jpg',
        'image/tiff',
        'image/webp',
      ],
    };
  }

  async extractFromBuffer(buffer: Buffer, mimeType?: string): Promise<EXIFExtractionResult> {
    try {
      if (buffer.length > this.config.maxFileSize) {
        return {
          success: false,
          error: `File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`,
        };
      }

      if (mimeType && !this.config.allowedMimeTypes.includes(mimeType)) {
        return {
          success: false,
          error: `MIME type ${mimeType} is not allowed. Allowed types: ${this.config.allowedMimeTypes.join(', ')}`,
        };
      }

      const exifData = await exifr.parse(buffer, {
        tiff: true,
        ifd0: true,
        ifd1: true,
        exif: true,
        gps: this.config.extractGPS,
        interop: true,
        icc: false,
        jfif: false,
        ihdr: false,
        xmp: false,
      });

      if (!exifData) {
        return {
          success: false,
          error: 'No EXIF data found in image',
        };
      }

      const metadata: EXIFMetadata = {
        fileSize: buffer.length,
        mimeType,
      };

      const validationErrors: string[] = [];

      if (this.config.extractGPS) {
        const gpsResult = this.extractGPSData(exifData);
        if (gpsResult) {
          metadata.gps = gpsResult;
          
          if (this.config.validateCoordinates) {
            const coordValidation = this.validateCoordinates(gpsResult);
            if (!coordValidation.valid) {
              validationErrors.push(...coordValidation.errors);
            }
          }
        }
      }

      if (this.config.extractCamera) {
        const cameraInfo = this.extractCameraInfo(exifData);
        if (cameraInfo) {
          metadata.camera = cameraInfo;
        }
      }

      if (this.config.extractTimestamp) {
        const timestampInfo = this.extractTimestampInfo(exifData);
        if (timestampInfo) {
          metadata.timestamp = timestampInfo;
        }
      }

      if (this.config.extractImageDimensions) {
        metadata.imageWidth = exifData.ImageWidth || exifData.PixelXDimension;
        metadata.imageHeight = exifData.ImageHeight || exifData.PixelYDimension;
        metadata.orientation = exifData.Orientation;
      }

      return {
        success: true,
        metadata,
        validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[EXIF] Extraction failed:', errorMessage);
      return {
        success: false,
        error: `EXIF extraction failed: ${errorMessage}`,
      };
    }
  }

  private extractGPSData(exifData: any): GPSCoordinates | null {
    if (!exifData.latitude || !exifData.longitude) {
      return null;
    }

    const coordinates: GPSCoordinates = {
      latitude: exifData.latitude,
      longitude: exifData.longitude,
    };

    if (exifData.GPSAltitude !== undefined) {
      coordinates.altitude = exifData.GPSAltitude;
    }

    if (exifData.GPSAccuracy !== undefined) {
      coordinates.accuracy = exifData.GPSAccuracy;
    }

    return coordinates;
  }

  private extractCameraInfo(exifData: any): CameraInfo | null {
    const cameraInfo: CameraInfo = {};

    if (exifData.Make) cameraInfo.make = exifData.Make;
    if (exifData.Model) cameraInfo.model = exifData.Model;
    if (exifData.Software) cameraInfo.software = exifData.Software;
    if (exifData.LensModel) cameraInfo.lensModel = exifData.LensModel;
    if (exifData.FocalLength) cameraInfo.focalLength = exifData.FocalLength;
    if (exifData.ISO) cameraInfo.iso = exifData.ISO;
    if (exifData.FNumber) cameraInfo.aperture = exifData.FNumber;
    if (exifData.ExposureTime) cameraInfo.shutterSpeed = this.formatShutterSpeed(exifData.ExposureTime);

    return Object.keys(cameraInfo).length > 0 ? cameraInfo : null;
  }

  private extractTimestampInfo(exifData: any): TimestampInfo | null {
    const timestampInfo: TimestampInfo = {};

    if (exifData.DateTimeOriginal) {
      timestampInfo.dateTimeOriginal = this.parseEXIFDate(exifData.DateTimeOriginal);
    }
    if (exifData.DateTimeDigitized) {
      timestampInfo.dateTimeDigitized = this.parseEXIFDate(exifData.DateTimeDigitized);
    }
    if (exifData.DateTime) {
      timestampInfo.dateTime = this.parseEXIFDate(exifData.DateTime);
    }
    if (exifData.OffsetTime) {
      timestampInfo.offsetTime = exifData.OffsetTime;
    }
    if (exifData.OffsetTimeOriginal) {
      timestampInfo.offsetTimeOriginal = exifData.OffsetTimeOriginal;
    }

    return Object.keys(timestampInfo).length > 0 ? timestampInfo : null;
  }

  private parseEXIFDate(dateString: string): Date {
    const parts = dateString.split(' ');
    if (parts.length === 2) {
      const datePart = parts[0].replace(/:/g, '-');
      return new Date(`${datePart} ${parts[1]}`);
    }
    return new Date(dateString);
  }

  private formatShutterSpeed(exposureTime: number): string {
    if (exposureTime >= 1) {
      return `${exposureTime}s`;
    }
    const denominator = Math.round(1 / exposureTime);
    return `1/${denominator}s`;
  }

  private validateCoordinates(coords: GPSCoordinates): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (coords.latitude < -90 || coords.latitude > 90) {
      errors.push(`Invalid latitude: ${coords.latitude}. Must be between -90 and 90.`);
    }

    if (coords.longitude < -180 || coords.longitude > 180) {
      errors.push(`Invalid longitude: ${coords.longitude}. Must be between -180 and 180.`);
    }

    if (coords.altitude !== undefined && coords.altitude < -11000) {
      errors.push(`Invalid altitude: ${coords.altitude}. Below Dead Sea elevation.`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  verifyTimestamp(metadata: EXIFMetadata, options: {
    maxAge?: number;
    minDate?: Date;
    maxDate?: Date;
  } = {}): { valid: boolean; error?: string } {
    if (!metadata.timestamp?.dateTimeOriginal) {
      return {
        valid: false,
        error: 'No capture timestamp found in EXIF data',
      };
    }

    const captureDate = metadata.timestamp.dateTimeOriginal;
    const now = new Date();

    if (captureDate > now) {
      return {
        valid: false,
        error: 'Capture timestamp is in the future',
      };
    }

    if (options.maxAge && (now.getTime() - captureDate.getTime()) > options.maxAge) {
      return {
        valid: false,
        error: `Capture timestamp exceeds maximum age of ${options.maxAge}ms`,
      };
    }

    if (options.minDate && captureDate < options.minDate) {
      return {
        valid: false,
        error: `Capture timestamp is before minimum allowed date`,
      };
    }

    if (options.maxDate && captureDate > options.maxDate) {
      return {
        valid: false,
        error: `Capture timestamp is after maximum allowed date`,
      };
    }

    return { valid: true };
  }

  verifyCameraModel(metadata: EXIFMetadata, expectedModel?: string): { valid: boolean; error?: string } {
    if (!expectedModel) {
      return { valid: true };
    }

    if (!metadata.camera?.model) {
      return {
        valid: false,
        error: 'No camera model found in EXIF data',
      };
    }

    const actualModel = metadata.camera.model.toLowerCase();
    const expected = expectedModel.toLowerCase();

    if (!actualModel.includes(expected)) {
      return {
        valid: false,
        error: `Camera model "${metadata.camera.model}" does not match expected "${expectedModel}"`,
      };
    }

    return { valid: true };
  }

  verifyGPSLocation(
    metadata: EXIFMetadata,
    bounds: {
      minLat?: number;
      maxLat?: number;
      minLon?: number;
      maxLon?: number;
    }
  ): { valid: boolean; error?: string } {
    if (!metadata.gps) {
      return {
        valid: false,
        error: 'No GPS coordinates found in EXIF data',
      };
    }

    const { latitude, longitude } = metadata.gps;

    if (bounds.minLat !== undefined && latitude < bounds.minLat) {
      return {
        valid: false,
        error: `Latitude ${latitude} is below minimum ${bounds.minLat}`,
      };
    }

    if (bounds.maxLat !== undefined && latitude > bounds.maxLat) {
      return {
        valid: false,
        error: `Latitude ${latitude} is above maximum ${bounds.maxLat}`,
      };
    }

    if (bounds.minLon !== undefined && longitude < bounds.minLon) {
      return {
        valid: false,
        error: `Longitude ${longitude} is below minimum ${bounds.minLon}`,
      };
    }

    if (bounds.maxLon !== undefined && longitude > bounds.maxLon) {
      return {
        valid: false,
        error: `Longitude ${longitude} is above maximum ${bounds.maxLon}`,
      };
    }

    return { valid: true };
  }
}

let service: EXIFExtractionService | null = null;

export function getEXIFExtractionService(config?: EXIFExtractionConfig): EXIFExtractionService {
  if (!service) {
    service = new EXIFExtractionService(config);
  }
  return service;
}

export async function extractEXIFMetadata(
  buffer: Buffer,
  mimeType?: string,
  config?: EXIFExtractionConfig
): Promise<EXIFExtractionResult> {
  const service = getEXIFExtractionService(config);
  return service.extractFromBuffer(buffer, mimeType);
}
