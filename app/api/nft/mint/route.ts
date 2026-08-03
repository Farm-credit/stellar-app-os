import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  buildMintCertificateTransaction,
  getMintingContractAddress,
} from '@/lib/stellar/nft-certificate';
import { TREES_PER_DOLLAR } from '@/lib/constants/donation';
import { withWalletLock } from '@/lib/cache/redlock';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { _donationId, txHash, projectId, amount, date, recipientAddress, network } = body;

    // 1. Check for missing fields
    const requiredFields = [
      'donationId',
      'txHash',
      'projectId',
      'amount',
      'date',
      'recipientAddress',
      'network',
    ];
    const missingFields = requiredFields.filter(
      (field) => body[field] === undefined || body[field] === null || body[field] === ''
    );
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // 2. Validate network
    if (network !== 'testnet' && network !== 'mainnet') {
      return NextResponse.json({ error: 'UNSUPPORTED_NETWORK' }, { status: 400 });
    }

    // 3. Validate contract configuration
    const contractId = getMintingContractAddress(network);
    if (!contractId) {
      return NextResponse.json({ error: 'CONTRACT_NOT_CONFIGURED' }, { status: 503 });
    }

    // 4. Validate recipient address
    if (!recipientAddress || !/^G[A-Z2-7]{55}$/.test(recipientAddress)) {
      return NextResponse.json({ error: 'INVALID_RECIPIENT_ADDRESS' }, { status: 400 });
    }

    // 5. Derive Token_ID
    const tokenId = createHash('sha256')
      .update(txHash + projectId)
      .digest('hex');

    // 6. Build Certificate Metadata
    const treeCount = Math.round(amount * TREES_PER_DOLLAR);
    const co2OffsetKg = treeCount * 0.048;
    const plantingDate = new Date(date).toISOString();
    const region = 'Northern Nigeria';

    const metadata = {
      treeCount,
      co2OffsetKg,
      plantingDate,
      region,
    };

    // 7. Store metadata JSON in public/metadata/[tokenId].json
    const metadataDir = path.join(process.cwd(), 'public', 'metadata');
    if (!fs.existsSync(metadataDir)) {
      fs.mkdirSync(metadataDir, { recursive: true });
    }
    const metadataPath = path.join(metadataDir, `${tokenId}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Construct Metadata_URI
    const url = new URL(req.url);
    const metadataUri = `${url.origin}/metadata/${tokenId}.json`;

    // 8. Build Soroban minting transaction XDR with wallet lock to prevent nonce collisions
    const { transactionXdr, networkPassphrase } = await withWalletLock(
      recipientAddress,
      async () => {
        logger.info('[api:nft:mint] Building mint tx with wallet lock', { recipientAddress, tokenId });
        return buildMintCertificateTransaction(recipientAddress, tokenId, metadataUri, network);
      },
      { ttlMs: 15_000, retryCount: 10 }
    );

    return NextResponse.json({
      transactionXdr,
      networkPassphrase,
      tokenId,
      metadataUri,
    });
  } catch (err: any) {
    logger.error('[api:nft:mint] Mint API Error', { err });
    const msg = err.message || 'Internal Server Error';
    const status = msg.includes('acquire lock') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
