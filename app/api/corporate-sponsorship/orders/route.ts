import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addCorporateOrder, getCorporateDashboardData } from '@/lib/corporate-sponsorship/store';

const createOrderSchema = z.object({
  quantity: z.number().int().min(10).max(10000),
  branding: z.object({
    companyName: z.string().trim().min(1, 'Company name is required').max(120),
    tagline: z.string().trim().max(160).optional(),
    primaryColor: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color')
      .default('#166534'),
    secondaryColor: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color')
      .default('#0f766e'),
    contactEmail: z.string().trim().email('Valid contact email is required'),
  }),
});

export function GET() {
  const data = getCorporateDashboardData();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid bulk sponsorship order payload',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const order = addCorporateOrder(parsed.data);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create corporate order',
      },
      { status: 500 }
    );
  }
}
