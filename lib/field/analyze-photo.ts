import { evaluatePhotoQuality, measurePixels, type PhotoQualityResult } from './photo-quality';

const ANALYSIS_MAX_EDGE = 640;

export interface AnalyzedPhoto {
  quality: PhotoQualityResult;
  width: number;
  height: number;
}

/** Decodes the file in the browser and runs the quality checks. Client-only. */
export async function analyzePhoto(file: File): Promise<AnalyzedPhoto> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, ANALYSIS_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(3, Math.round(bitmap.width * scale));
    const h = Math.max(3, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas is not available');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { sharpness, brightness } = measurePixels(ctx.getImageData(0, 0, w, h).data, w, h);
    return {
      quality: evaluatePhotoQuality({
        bytes: file.size,
        width: bitmap.width,
        height: bitmap.height,
        sharpness,
        brightness,
      }),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
}

export function getDeviceLocation(): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('GPS is not available on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        }),
      (err) => reject(new Error(err.message || 'Could not read GPS location')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    );
  });
}
