import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    // 👉 Integrate Mailchimp / SendGrid here
    // Example:
    // await sendDoubleOptIn(email);

    console.log('Double opt-in email triggered for:', email);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
