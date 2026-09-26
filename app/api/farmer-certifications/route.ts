import { NextResponse } from 'next/server';
import { addFarmerCredential, listFarmerCredentials } from '@/lib/services/farmer-certifications';
import {
  FARMER_CERTIFICATIONS,
  type FarmerCertification,
  type FarmerCredential,
} from '@/lib/types/farmer-certification';

export const runtime = 'nodejs';
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requested = (params.get('certifications') ?? '')
    .split(',')
    .filter(Boolean) as FarmerCertification[];
  if (requested.some((value) => !FARMER_CERTIFICATIONS.includes(value)))
    return NextResponse.json({ error: 'Unsupported certification' }, { status: 400 });
  return NextResponse.json({
    credentials: listFarmerCredentials(requested, params.get('region') ?? undefined),
    availableCertifications: FARMER_CERTIFICATIONS,
  });
}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Omit<FarmerCredential, 'id'>;
    if (!body.farmerId || !body.farmerName || !body.region || !body.verifier)
      return NextResponse.json(
        { error: 'farmerId, farmerName, region, and verifier are required' },
        { status: 400 }
      );
    if (body.certifications.some((value) => !FARMER_CERTIFICATIONS.includes(value)))
      return NextResponse.json({ error: 'Unsupported certification' }, { status: 400 });
    return NextResponse.json({ credential: addFarmerCredential(body) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to add certification' },
      { status: 400 }
    );
  }
}
