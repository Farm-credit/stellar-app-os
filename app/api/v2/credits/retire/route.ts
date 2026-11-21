import { NextResponse } from 'next/server';
import { createBlockchainReceipt, listBlockchainReceipts } from '@/lib/retirement/receipt';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { notifyCreditRetired } from '@/lib/webhook/offset-verification-bridge';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      buyerAddress,
      organizationName,
      quantity, // tons
      reason,
      projectId,
      transactionHash,
      ledgerSequence,
      network = 'testnet',
    } = body;

    if (!buyerAddress || !projectId) {
      return NextResponse.json(
        { error: 'Missing required parameters: buyerAddress and projectId are required.' },
        { status: 400 }
      );
    }

    const quantityNum = Number(quantity);
    if (!quantityNum || quantityNum <= 0) {
      return NextResponse.json(
        { error: 'Quantity must be a positive number of metric tonnes.' },
        { status: 400 }
      );
    }

    // Match project metadata from project directory if available
    const project = mockCarbonProjects.find((p) => p.id === projectId);

    const receipt = createBlockchainReceipt({
      buyerAddress,
      organizationName,
      quantityRetiredTons: quantityNum,
      reason,
      projectId,
      projectName: project?.name,
      projectType: project?.type,
      location: project?.location,
      vintageYear: project?.vintageYear,
      standard: project?.verificationStatus,
      coBenefits: project?.coBenefits,
      transactionHash,
      ledgerSequence,
      network: network === 'mainnet' ? 'mainnet' : 'testnet',
    });

    logger.info('[api:v2:credits:retire] Issued immutable blockchain receipt', {
      receiptId: receipt.receiptId,
      transactionHash: receipt.transactionHash,
      creditsRetired: receipt.creditsRetired,
      projectId: receipt.project.id,
      coBenefitsCount: receipt.coBenefits.length,
      timestamp: receipt.timestamp,
    });

    // Outbound `credit.retired` notification (issue #1316). Fire-and-forget: the
    // bridge never throws, so a webhook problem cannot fail the retirement.
    void notifyCreditRetired({
      creditId: receipt.receiptId,
      assetCode: `CARBON-${receipt.project.id}-${receipt.project.vintageYear}`,
      projectId: receipt.project.id,
      buyerWallet: receipt.buyer.walletAddress,
      quantityTonnes: receipt.creditsRetired,
      retirementPurpose: receipt.retirementReason,
      beneficiary: receipt.buyer.organizationName ?? null,
      retirementCertificateUrl: receipt.certificateUrl,
      transactionHash: receipt.transactionHash,
      explorerUrl: receipt.explorerUrl,
      retiredAt: receipt.timestamp,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Carbon credits successfully retired. Immutable blockchain receipt generated.',
        receipt,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('[api:v2:credits:retire] Error retiring credits', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const buyerAddress = searchParams.get('buyer') || undefined;

    const receipts = listBlockchainReceipts(buyerAddress);
    return NextResponse.json({
      count: receipts.length,
      receipts,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve receipts' },
      { status: 500 }
    );
  }
}
