import { NextResponse, type NextRequest } from 'next/server';
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token || body.token.length > 512)
    return NextResponse.json({ error: 'A valid push token is required' }, { status: 400 });
  return NextResponse.json({ registered: true });
}
