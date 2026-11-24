import { NextResponse } from 'next/server';
import { buildAndSubmitEscrowRelease } from '@/lib/stellar/escrow';
import {
  approveMilestoneWithGracePeriod,
  MilestoneFinalizationError,
  serializeMilestoneFinalization,
} from '@/lib/escrow/milestone-finalization';
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

    const {
      loanId,
      farmerWalletAddress,
      escrowSecretKey,
      network,
      verification,
      totalAmountUsdc,
      verifierWalletAddress,
      gracePeriodEndsAt,
      milestoneId,
    } = body;

    if (!loanId || !farmerWalletAddress || !escrowSecretKey || !network || !totalAmountUsdc) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (totalAmountUsdc <= 0) {
      return NextResponse.json({ error: 'Invalid escrow amount' }, { status: 400 });
    }

    if (verifierWalletAddress !== undefined && !verifierWalletAddress.trim()) {
      return NextResponse.json(
        { error: 'verifierWalletAddress must not be empty' },
        { status: 400 }
      );
    }

    if (gracePeriodEndsAt !== undefined && !verifierWalletAddress?.trim()) {
      return NextResponse.json(
        { error: 'verifierWalletAddress is required when scheduling grace-period finalization' },
        { status: 400 }
      );
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

    if (gracePeriodEndsAt !== undefined && verifierWalletAddress) {
      try {
        const queued = approveMilestoneWithGracePeriod({
          loanId,
          milestoneId: milestoneId ?? 1,
          farmerWalletAddress,
          approvingVerifierAddress: verifierWalletAddress,
          totalDisbursementUsdc: totalAmountUsdc * 0.75,
          escrowSecretKey,
          network,
          gracePeriodEndsAt,
        });

        if (verifiedPhotoHash) {
          await safelyRecordUploadedPhotoHash({
            entityType: 'tree',
            entityId: loanId,
            hashHex: verifiedPhotoHash,
            storageRef: `escrow:pending:${queued.id}`,
            metadata: {
              farmerWalletAddress,
              verifierWalletAddress,
              network,
              gpsCoordinates: verification.gpsCoordinates,
              submittedAt: verification.submittedAt,
            },
            routeLabel: 'escrow/release',
          });
        }

        return NextResponse.json(
          {
            finalizationStatus: queued.status,
            gracePeriodEndsAt: queued.gracePeriodEndsAt,
            releasedAmountUsdc: queued.totalDisbursementUsdc,
            farmerWalletAddress: queued.farmerWalletAddress,
            farmerPayoutUsdc: queued.split.farmerPayoutUsdc,
            verifierWalletAddress: queued.approvingVerifierAddress,
            verifierRewardUsdc: queued.split.verifierRewardUsdc,
            finalization: serializeMilestoneFinalization(queued),
            ...(verifiedPhotoHash ? { photoHash: verifiedPhotoHash } : {}),
          },
          { status: 202 }
        );
      } catch (err) {
        if (err instanceof MilestoneFinalizationError) {
          const status =
            err.code === 'INVALID_INPUT' || err.code === 'INVALID_VERIFIER' ? 400 : 409;
          return NextResponse.json({ error: err.message, code: err.code }, { status });
        }
        throw err;
      }
    }

    const result = await buildAndSubmitEscrowRelease(
      totalAmountUsdc,
      farmerWalletAddress,
      escrowSecretKey,
      network,
      loanId,
      verifierWalletAddress ? { verifierWalletAddress, milestoneId } : {}
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
      ...(result.farmerPayoutUsdc !== undefined
        ? { farmerPayoutUsdc: result.farmerPayoutUsdc }
        : {}),
      ...(result.verifierWalletAddress
        ? { verifierWalletAddress: result.verifierWalletAddress }
        : {}),
      ...(result.verifierRewardUsdc !== undefined
        ? { verifierRewardUsdc: result.verifierRewardUsdc }
        : {}),
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
