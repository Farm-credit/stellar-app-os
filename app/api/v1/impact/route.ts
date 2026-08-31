import { getImpactResponse } from '@/app/api/impact/route';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return getImpactResponse(request, 'v1');
}
