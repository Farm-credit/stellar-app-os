import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'missing', message: 'Token is missing' }, { status: 400 });
    }

    // Mock token verification:
    // If token === "expired-token", return expired
    // If token === "invalid-token", return error
    // Else return success

    if (token === 'expired-token') {
      return NextResponse.json(
        { error: 'expired', message: 'Token has expired.' },
        { status: 400 }
      );
    }

    if (token === 'invalid-token') {
      return NextResponse.json({ error: 'invalid', message: 'Token is invalid.' }, { status: 400 });
    }

    // Success case
    // In a real scenario we'd update user's verified status in DB here
    global.mockVerifiedStatus = true; // Use global just for mock polling across requests

    return NextResponse.json(
      { success: true, message: 'Email verified successfully' },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: 'server_error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
