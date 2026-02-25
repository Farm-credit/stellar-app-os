import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() }, { status: 200 });
}

export function HEAD() {
  return new NextResponse(null, { status: 200 });
}
