import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // In a real application, you would get the user from the session
    // and send an email or handle rate limiting.

    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Reset the mock status just in case
    global.mockVerifiedStatus = false;

    return NextResponse.json(
      { success: true, message: 'Verification email sent!' },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to resend email' },
      { status: 500 }
    );
  }
}
