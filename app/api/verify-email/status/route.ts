import { NextResponse } from 'next/server';

// We use global for mocking state in the dev server
declare global {
  var mockVerifiedStatus: boolean | undefined;
}

export function GET() {
  try {
    const isVerified = global.mockVerifiedStatus === true;

    return NextResponse.json({ verified: isVerified }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
