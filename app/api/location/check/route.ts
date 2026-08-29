import { NextResponse } from 'next/server';
import { checkRegionCoverage } from '@/lib/geo/polygon';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI / 180);
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = R * c;
  const miles = km * 0.621371;
  return { km, miles };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    const regionCode = String(body?.regionCode ?? '').trim();

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !regionCode) {
      return NextResponse.json({
        { error: 'latitude, longitude, and regionCode are required' },
        { status: 400 }
      );
    }

    const sponsorLatitude = Number(body?.sponsorLatitude);
    const sponsorLongitude = Number(body?.sponsorLongitude);
    const hasSponsorLocation = Number.isFinite(sponsorLatitude) && Number.isFinite(sponsorLongitude);

    const responsePayload: Record<string, any> = {
      inRegion: checkRegionCoverage({ latitude, longitude, regionCode }),
      regionCode,
    };

    if (hasSponsorLocation) {
      const distance = haversineDistance(latitude, longitude, sponsorLatitude, sponsorLongitude);
      responsePayload.distanceKm = Number(distance.km.toFixed(2));
      responsePayload.distanceMiles = Number(distance.miles.toFixed(2));
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('[location/check] error', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
