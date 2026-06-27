import { NextResponse } from 'next/server';
import { sendJobAcceptedEmail } from '@/lib/email/sendgrid';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      treeId?: string;
      planterName?: string;
      species?: string;
      sponsorEmail?: string;
      sponsorName?: string;
    };

    const { treeId, planterName, species, sponsorEmail, sponsorName } = body;

    if (!treeId || !planterName || !species || !sponsorEmail || !sponsorName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await sendJobAcceptedEmail({ sponsorEmail, sponsorName, treeId, planterName, species });

    return NextResponse.json({ message: 'Job accepted and sponsor notified.' }, { status: 200 });
  } catch (error) {
    console.error('[planting/accept] error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
