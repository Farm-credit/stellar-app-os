import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { mockAdminUsers } from '@/lib/api/mock/adminUsers';
import type {
  AirdropRequest,
  AirdropPreview,
  AirdropResult,
  AirdropRecipient,
} from '@/lib/types/carbon';

function getEarlySponsors(platformLaunchDate: string): AirdropRecipient[] {
  const launch = new Date(platformLaunchDate);
  const cutoff = new Date(launch);
  cutoff.setMonth(cutoff.getMonth() + 6);

  return mockAdminUsers
    .filter((user) => {
      if (user.status === 'Deleted') return false;
      const joined = new Date(user.joinedAt);
      if (joined < launch || joined > cutoff) return false;
      // must have at least one sponsorship activity (donation or credit purchase)
      return user.activityLog.some(
        (entry) => entry.type === 'donation' || entry.type === 'credit_purchase'
      );
    })
    .map((user) => ({
      userId: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      joinedAt: user.joinedAt,
    }));
}

export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const platformLaunchDate = searchParams.get('platformLaunchDate');
  const creditsPerSponsor = Number(searchParams.get('creditsPerSponsor') ?? 0);

  if (!platformLaunchDate || isNaN(new Date(platformLaunchDate).getTime())) {
    return NextResponse.json({ error: 'Invalid or missing platformLaunchDate' }, { status: 400 });
  }

  if (creditsPerSponsor <= 0) {
    return NextResponse.json(
      { error: 'creditsPerSponsor must be greater than zero' },
      { status: 400 }
    );
  }

  const recipients = getEarlySponsors(platformLaunchDate);
  const cutoff = new Date(platformLaunchDate);
  cutoff.setMonth(cutoff.getMonth() + 6);

  const preview: AirdropPreview = {
    recipients,
    totalCredits: recipients.length * creditsPerSponsor,
    cutoffDate: cutoff.toISOString(),
  };

  return NextResponse.json(preview);
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as AirdropRequest;
    const { creditsPerSponsor, projectId, platformLaunchDate } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    if (!platformLaunchDate || isNaN(new Date(platformLaunchDate).getTime())) {
      return NextResponse.json({ error: 'Invalid or missing platformLaunchDate' }, { status: 400 });
    }

    if (!creditsPerSponsor || creditsPerSponsor <= 0) {
      return NextResponse.json(
        { error: 'creditsPerSponsor must be greater than zero' },
        { status: 400 }
      );
    }

    const recipients = getEarlySponsors(platformLaunchDate);

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'No eligible sponsors found for the given launch date' },
        { status: 400 }
      );
    }

    // TODO: replace with real Stellar CARBON token transfer per recipient wallet
    const results: AirdropResult = {
      totalQueued: recipients.length,
      recipients: recipients.map((r) => ({
        walletAddress: r.walletAddress,
        status: 'queued' as const,
      })),
    };

    console.info(
      `[airdrop] Admin queued ${results.totalQueued} retroactive allocations — ` +
        `${creditsPerSponsor} credits each for project ${projectId}`
    );

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Airdrop failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
