import { NextResponse } from 'next/server';
import exifr from 'exifr';
import { getDistance } from '@/lib/geo/distance';
import { uploadImageToS3 } from '@/lib/aws/s3';
import { encryptGpsCoordinates } from '@/lib/zk/locationProof';

// Maximum allowable distance (in meters) between Exif GPS and farmer-submitted GPS.
const MAX_DISTANCE_METERS = 500;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const photo = formData.get('photo') as File | null;
    const latStr = formData.get('lat') as string | null;
    const lonStr = formData.get('lon') as string | null;
    const farmerId = formData.get('farmerId') as string | null;

    if (!photo || !latStr || !lonStr || !farmerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json({ error: 'Invalid coordinates formats' }, { status: 400 });
    }

    const buffer = Buffer.from(await photo.arrayBuffer());

    // Extract EXIF GPS data (fails gracefully if none exists or it cannot be read)
    const exifData = await exifr.gps(buffer).catch((err) => {
      console.warn('Exifr extraction warning:', err);
      return null;
    });

    if (!exifData || exifData.latitude === undefined || exifData.longitude === undefined) {
      return NextResponse.json(
        { error: 'No GPS EXIF metadata found in the provided photo.' },
        { status: 422 }
      );
    }

    const { latitude: exifLat, longitude: exifLon } = exifData;

    // Validate distance constraint
    const distance = getDistance(lat, lon, exifLat, exifLon);
    if (distance > MAX_DISTANCE_METERS) {
      return NextResponse.json(
        { 
          error: 'Verification failed: Distance between photo GPS and submitted coordinates is too large.',
          distanceMeters: Math.round(distance),
        },
        { status: 422 }
      );
    }

    // Upload to AWS S3 securely
    const s3Key = await uploadImageToS3(farmerId, buffer, photo.type);

    // Encrypt EXIF GPS coordinates for privacy
    const encryptedGps = await encryptGpsCoordinates({ lat: exifLat, lon: exifLon });

    return NextResponse.json(
      {
        message: 'Photo uploaded and metadata verified successfully.',
        s3Key,
        encryptedGps,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[planting/photo] upload error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
