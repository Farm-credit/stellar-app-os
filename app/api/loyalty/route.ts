import { NextResponse, type NextRequest } from 'next/server';
export const runtime = 'nodejs';
const catalogue = [
  {
    id: 'tree',
    name: 'Sponsor one native tree',
    type: 'tree',
    pointsCost: 500,
    partner: 'FarmCredit Groves',
  },
  {
    id: 'mug',
    name: 'Recycled fibre travel mug',
    type: 'partner_discount',
    pointsCost: 1200,
    partner: 'EarthKind Supply',
    discountPercent: 10,
  },
  {
    id: 'seed',
    name: 'Native seed collection',
    type: 'partner_discount',
    pointsCost: 800,
    partner: 'Local Cooperative',
    discountPercent: 15,
  },
];
export function GET(request: NextRequest) {
  const sponsor = request.nextUrl.searchParams.get('sponsor');
  return NextResponse.json({
    sponsor,
    balance: 2460,
    expiresAt: '2028-10-18T00:00:00.000Z',
    expiryPolicy: 'Points expire 2 years after they are earned if unused.',
    catalogue,
  });
}
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    sponsor?: string;
    rewardId?: string;
  } | null;
  const reward = catalogue.find((item) => item.id === body?.rewardId);
  if (!reward || !body?.sponsor)
    return NextResponse.json(
      { error: 'sponsor and a valid rewardId are required' },
      { status: 400 }
    );
  return NextResponse.json(
    { status: 'reserved', reward, redemptionId: `redemption_${Date.now()}` },
    { status: 201 }
  );
}
