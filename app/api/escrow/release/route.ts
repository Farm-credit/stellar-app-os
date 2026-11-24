import { NextResponse } from 'next/server';
import { buildAndSubmitEscrowRelease } from '@/lib/stellar/escrow';
import type { MilestoneReleaseRequest } from '@/lib/types/escrow';
import { emitMilestonePayoutApproved } from '@/lib/webhook/events';
import {
  guardUploadAgainstDuplicates,
  safelyRecordUploadedPhotoHash,
} from '@/lib/image/upload-dedup';
import type { PHashHex } from '@/lib/image/phash';

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

    // Perceptual hash duplicate guard before releasing escrow funds on-chain
    let verifiedPhotoHash: PHashHex | null = null;
    try {
      const photoBuffer = Buffer.from(verification.photoBase64, 'base64');
      const verdict = await guardUploadAgainstDuplicates(photoBuffer, {
        entityType: 'tree',
        entityId: loanId,
        routeLabel: 'escrow/release',
      });

      if (verdict.isDuplicate) {
        return NextResponse.json(
          {
            error:
              'Duplicate or reused field verification photo detected. Submit a fresh on-site photo to release escrow funds.',
            code: 'DUPLICATE_PHOTO',
            hash: verdict.phash.hex,
            distance: verdict.distance,
            similarity: verdict.similarityScore,
            threshold: verdict.threshold,
            duplicateOf: verdict.duplicateOf,
          },
          { status: 422 }
        );
      }
      verifiedPhotoHash = verdict.phash.hex;
    } catch (hashErr) {
      console.warn(
        `[escrow/release] Could not compute pHash for loan ${loanId} verification payload:`,
        hashErr instanceof Error ? hashErr.message : String(hashErr)
      );
    }

    const result = await buildAndSubmitEscrowRelease(
      totalAmountUsdc,
      farmerWalletAddress,
      escrowSecretKey,
      network,
      loanId
    );

    if (verifiedPhotoHash) {
      await safelyRecordUploadedPhotoHash({
        entityType: 'tree',
        entityId: loanId,
        hashHex: verifiedPhotoHash,
        storageRef: `escrow:${result.transactionHash}`,
        metadata: {
          farmerWalletAddress,
          network,
          gpsCoordinates: verification.gpsCoordinates,
          submittedAt: verification.submittedAt,
        },
        routeLabel: 'escrow/release',
      });
    }

    // Notify planter backends now that the payout is confirmed on-chain.
    void emitMilestonePayoutApproved({
      loanId,
      farmerWalletAddress: result.farmerWalletAddress,
      releasedAmountUsdc: result.releasedAmountUsdc,
      network,
      transactionHash: result.transactionHash,
      explorerUrl: result.explorerUrl,
      approvedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ...result,
      ...(verifiedPhotoHash ? { photoHash: verifiedPhotoHash } : {}),
    });
  } catch (error) {
    console.error('Escrow release error:', error);
    const message = error instanceof Error ? error.message : 'Escrow release failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
