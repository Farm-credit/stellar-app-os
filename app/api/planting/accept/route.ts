import { NextResponse } from 'next/server';
import { sendJobAcceptedEmail } from '@/lib/email/sendgrid';
import { invokeAcceptJob } from '@/lib/stellar/accept-job';
import type { NetworkType } from '@/lib/types/wallet';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      assignmentId?: string;
      planterAddress?: string;
      planterName?: string;
      species?: string;
      sponsorEmail?: string;
      sponsorName?: string;
    };

    const { assignmentId, planterAddress, planterName, species, sponsorEmail, sponsorName } = body;

    if (!assignmentId || !planterName || !species || !sponsorEmail || !sponsorName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let txHash: string | null = null;

    if (planterAddress) {
      try {
        const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as NetworkType;
        txHash = await invokeAcceptJob(planterAddress, assignmentId, network);
      } catch (contractErr) {
        console.warn('[planting/accept] contract call non-fatal:', contractErr);
      }
    }

    if (sponsorEmail) {
      await sendJobAcceptedEmail({
        sponsorEmail,
        sponsorName: sponsorName ?? 'Sponsor',
        treeId: assignmentId,
        planterName: planterName ?? 'A Planter',
        species: species ?? 'Tree',
      });
    }

    return NextResponse.json(
      {
        message: 'Job accepted.',
        txHash,
        sponsorNotified: !!sponsorEmail,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[planting/accept] error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
