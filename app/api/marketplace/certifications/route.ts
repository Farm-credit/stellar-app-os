import { NextResponse } from 'next/server';
import { listFarmerCredentials } from '@/lib/services/farmer-credentials';
import {
  SUSTAINABILITY_CERTIFICATIONS,
  type SustainabilityCertification,
} from '@/lib/types/issue-1374-1377';
export function GET(request: Request) {
  const value = new URL(request.url).searchParams.get(
    'certification'
  ) as SustainabilityCertification | null;
  if (value && !SUSTAINABILITY_CERTIFICATIONS.includes(value))
    return NextResponse.json({ error: 'Unsupported certification' }, { status: 400 });
  return NextResponse.json({
    certifications: SUSTAINABILITY_CERTIFICATIONS,
    farmers: listFarmerCredentials(value ?? undefined),
  });
}
