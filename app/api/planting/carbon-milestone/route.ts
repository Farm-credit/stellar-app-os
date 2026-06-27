import { NextResponse } from 'next/server';
import { sendCarbonMilestoneEmail } from '@/lib/email/sendgrid';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sponsorEmail?: string;
      sponsorName?: string;
      totalCo2Kg?: number;
      treeCount?: number;
    };

    const { sponsorEmail, sponsorName, totalCo2Kg, treeCount } = body;

    if (!sponsorEmail || !sponsorName || totalCo2Kg == null || treeCount == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await sendCarbonMilestoneEmail({ sponsorEmail, sponsorName, totalCo2Kg, treeCount });

    return NextResponse.json({ message: 'Carbon milestone email sent.' }, { status: 200 });
  } catch (error) {
    console.error('[planting/carbon-milestone] error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
