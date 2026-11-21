import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addHealthObservation, getTreeHealthSummary } from '@/lib/tree-health/store';

const createObservationSchema = z.object({
  heightCm: z.number().min(1, 'Height must be greater than 0 cm').max(5000, 'Height is unrealistic'),
  pestPresence: z.enum(['none', 'mild', 'moderate', 'severe']),
  wateringStatus: z.enum(['optimal', 'adequate', 'dry', 'critical']),
  observerName: z.string().trim().min(1, 'Observer name is required').max(100),
  notes: z.string().max(500).optional(),
  observedAt: z.string().datetime().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const summary = getTreeHealthSummary(id);
  return NextResponse.json(summary, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = createObservationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid health observation payload',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const result = addHealthObservation({
      treeId: id,
      ...parsed.data,
    });

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to log health observation' }, { status: 500 });
  }
}
