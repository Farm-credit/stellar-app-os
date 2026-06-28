import { NextResponse } from 'next/server';
import { checkRegionCoverage } from '@/lib/geo/polygon';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    const regionCode = String(body?.regionCode ?? '').trim();

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !regionCode) {
      return NextResponse.json({ error: 'latitude, longitude, and regionCode are required' }, { status: 400 });
    }

    return NextResponse.json({
      inRegion: checkRegionCoverage({ latitude, longitude, regionCode }),
      regionCode,
    });
  } catch (error) {
    console.error('[location/check] error', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
