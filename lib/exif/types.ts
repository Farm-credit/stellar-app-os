export interface GpsCoordinates {
  latitude: number;
  longitude: number;
  /** Meters above sea level, when the device recorded one. */
  altitude?: number;
}

export interface PhotoMetadata {
  gps: GpsCoordinates | null;
  /** When the shutter fired, read from EXIF DateTimeOriginal (falls back to DateTime). */
  capturedAt: Date | null;
  deviceMake: string | null;
  deviceModel: string | null;
}

export type ExtractionStatus =
  | "idle"
  | "reading"
  | "success"
  | "no-metadata"
  | "error";

export interface ExtractionResult {
  status: ExtractionStatus;
  metadata: PhotoMetadata | null;
  error: string | null;
}

/** Injectable so tests (and future formats) can swap the extraction strategy. */
export type ExifParser = (file: File) => Promise<PhotoMetadata>;
