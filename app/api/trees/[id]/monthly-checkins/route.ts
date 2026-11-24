import { NextResponse } from 'next/server';
import {
  createTreeMonthlyCheckIn,
  currentCheckInMonth,
  listTreeMonthlyCheckIns,
  nextCheckInDate,
} from '@/lib/tree-growth/monthly-checkins';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const checkIns = await listTreeMonthlyCheckIns(id);
    const checkinMonth = currentCheckInMonth();
    return NextResponse.json(
      {
        checkIns,
        checkinMonth,
        canCheckIn: !checkIns.some((checkIn) => checkIn.checkinMonth === checkinMonth),
        nextCheckInAt: nextCheckInDate(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[tree-monthly-checkins] Could not load check-ins:', error);
    return NextResponse.json({ error: 'Could not load monthly check-ins.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Request body must be an object.' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const photoCid = input.photoCid;
  const submittedBy = input.submittedBy;
  const caption = input.caption;
  const heightCm = input.heightCm;
  if (
    typeof photoCid !== 'string' ||
    !/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(photoCid)
  ) {
    return NextResponse.json({ error: 'A valid IPFS photo CID is required.' }, { status: 400 });
  }
  if (typeof submittedBy !== 'string' || !submittedBy.trim() || submittedBy.trim().length > 100) {
    return NextResponse.json(
      { error: 'submittedBy must be between 1 and 100 characters.' },
      { status: 400 }
    );
  }
  if (caption !== undefined && (typeof caption !== 'string' || caption.length > 500)) {
    return NextResponse.json({ error: 'caption must be 500 characters or fewer.' }, { status: 400 });
  }
  if (
    heightCm !== undefined &&
    (typeof heightCm !== 'number' || !Number.isFinite(heightCm) || heightCm < 1 || heightCm > 5000)
  ) {
    return NextResponse.json({ error: 'heightCm must be between 1 and 5000.' }, { status: 400 });
  }

  const imageUrl = `https://gateway.pinata.cloud/ipfs/${photoCid}`;
  try {
    const checkIn = await createTreeMonthlyCheckIn({
      treeId: id,
      photoCid,
      imageUrl,
      submittedBy: submittedBy.trim(),
      caption: typeof caption === 'string' && caption.trim() ? caption.trim() : null,
      heightCm: typeof heightCm === 'number' ? heightCm : null,
    });
    if (!checkIn) {
      return NextResponse.json(
        { error: 'A monthly check-in has already been submitted for this tree.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ checkIn }, { status: 201 });
  } catch (error) {
    console.error('[tree-monthly-checkins] Could not save check-in:', error);
    return NextResponse.json({ error: 'Could not save monthly check-in.' }, { status: 500 });
  }
}
