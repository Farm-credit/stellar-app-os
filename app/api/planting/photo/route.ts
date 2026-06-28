import { NextResponse } from 'next/server';
import exifr from 'exifr';
import { getDistance } from '@/lib/geo/distance';
import { uploadImageToS3 } from '@/lib/aws/s3';
import { encryptGpsCoordinates } from '@/lib/zk/locationProof';
import { sendPhotoUploadedEmail } from '@/lib/email/sendgrid';
import { getPool } from '@/lib/db/client';
import { encodeGeohash } from '@/lib/geo/geohash';

// Maximum allowable distance (in meters) between Exif GPS and farmer-submitted GPS.
const MAX_DISTANCE_METERS = 500;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const photo = formData.get('photo') as File | null;
    const latStr = formData.get('lat') as string | null;
    const lonStr = formData.get('lon') as string | null;
    const farmerId = formData.get('farmerId') as string | null;
    const treeId = formData.get('treeId') as string | null;
    const sponsorEmail = formData.get('sponsorEmail') as string | null;
    const sponsorName = formData.get('sponsorName') as string | null;
    const region = (formData.get('region') as string | null) ?? 'unknown';

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
          error:
            'Verification failed: Distance between photo GPS and submitted coordinates is too large.',
          distanceMeters: Math.round(distance),
        },
        { status: 422 }
      );
    }

    // Upload to AWS S3 securely
    const s3Key = await uploadImageToS3(farmerId, buffer, photo.type);

    // Store hashed region for the live map (no raw GPS persisted)
    const { regionKey, centerLat, centerLon } = buildRegionHash({ lat: exifLat, lon: exifLon });
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO planting_regions (region_key, center_lat, center_lon, farmer_id, s3_key, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [regionKey, centerLat, centerLon, farmerId, s3Key]
      );
    } catch (dbErr) {
      // Non-fatal: map data is best-effort; don't fail the upload
      console.error('[planting/photo] region insert error:', dbErr);
    }

    // Encrypt EXIF GPS coordinates for privacy
    const encryptedGps = await encryptGpsCoordinates({ lat: exifLat, lon: exifLon });

    // Upsert a hashed regional coordinate for the live map (precision-5 ≈ 5km cell).
    // Exact GPS is never stored.
    const geohash = encodeGeohash(exifLat, exifLon, 5);
    await getPool()
      .query(
        `INSERT INTO tree_map_points (geohash, region, tree_count)
         VALUES ($1, $2, 1)
         ON CONFLICT (geohash) DO UPDATE
           SET tree_count   = tree_map_points.tree_count + 1,
               last_updated = NOW()`,
        [geohash, region]
      )
      .catch((err) => console.error('[planting/photo] map upsert error:', err));

    // Notify sponsor if contact info provided
    if (sponsorEmail && sponsorName && treeId) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      const photoUrl = `${appUrl}/api/planting/photo/${s3Key}`;
      await sendPhotoUploadedEmail({ sponsorEmail, sponsorName, treeId, photoUrl }).catch((err) =>
        console.error('[planting/photo] email error:', err)
      );
    }

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
