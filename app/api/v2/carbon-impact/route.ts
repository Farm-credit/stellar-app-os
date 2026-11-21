import { NextResponse } from 'next/server';
import { calculateCarbonImpact, carbonImpactRequestSchema } from '@/lib/api/carbon-company-impact';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = carbonImpactRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid carbon impact request',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  return NextResponse.json(calculateCarbonImpact(parsed.data), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
