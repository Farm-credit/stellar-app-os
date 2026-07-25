import { NextResponse } from 'next/server';
import { buildAndSubmitEscrowRelease } from '@/lib/stellar/escrow';
import type { MilestoneReleaseRequest } from '@/lib/types/escrow';
import { emitMilestonePayoutApproved } from '@/lib/webhook/events';

function validateVerification(
  verification: MilestoneReleaseRequest['verification']
): string | null {
  const { gpsCoordinates, photoBase64, photoMimeType } = verification;

  if (
    typeof gpsCoordinates?.latitude !== 'number' ||
    typeof gpsCoordinates?.longitude !== 'number' ||
    gpsCoordinates.latitude < -90 ||
    gpsCoordinates.latitude > 90 ||
    gpsCoordinates.longitude < -180 ||
    gpsCoordinates.longitude > 180
  ) {
    return 'Invalid GPS coordinates';
  }

  if (!photoBase64 || photoBase64.length < 100) {
    return 'Photo is required';
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(photoMimeType)) {
    return 'Photo must be JPEG, PNG, or WebP';
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MilestoneReleaseRequest & {
      totalAmountUsdc: number;
    };

    const { loanId, farmerWalletAddress, escrowSecretKey, network, verification, totalAmountUsdc } =
      body;

    if (!loanId || !farmerWalletAddress || !escrowSecretKey || !network || !totalAmountUsdc) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (totalAmountUsdc <= 0) {
      return NextResponse.json({ error: 'Invalid escrow amount' }, { status: 400 });
    }

    const verificationError = validateVerification(verification);
    if (verificationError) {
      return NextResponse.json({ error: verificationError }, { status: 422 });
    }

    const result = await buildAndSubmitEscrowRelease(
      totalAmountUsdc,
      farmerWalletAddress,
      escrowSecretKey,
      network,
      loanId
    );

    // Notify planter backends now that the payout is confirmed on-chain.
    // Best-effort: a webhook failure must not fail an already-released payout,
    // so we don't await and errors are swallowed/retried inside the emitter.
    void emitMilestonePayoutApproved({
      loanId,
      farmerWalletAddress: result.farmerWalletAddress,
      releasedAmountUsdc: result.releasedAmountUsdc,
      network,
      transactionHash: result.transactionHash,
      explorerUrl: result.explorerUrl,
      approvedAt: new Date().toISOString(),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Escrow release error:', error);
    const message = error instanceof Error ? error.message : 'Escrow release failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
