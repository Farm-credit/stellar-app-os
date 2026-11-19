/**
 * Limited-edition NFT minting logic for rare species collectibles (#1162).
 *
 * Extends the existing NFT certificate minting pipeline
 * (lib/stellar/nft-certificate.ts) with:
 *   - Supply cap enforcement (per-species mint counter)
 *   - Edition-number assignment
 *   - Rich on-chain metadata (rarity tier, IUCN status, conservation lore)
 *   - Distinct token-ID derivation from the standard certificate IDs
 *
 * The mint counter is stored in Redis to survive server restarts and support
 * distributed deployments. The key format is:
 *   `limited-edition:mint-count:<speciesSlug>`
 */

import { createHash } from 'crypto';
import { createClient } from 'redis';
import { buildMintCertificateTransaction, getMintingContractAddress } from '@/lib/stellar/nft-certificate';
import { withWalletLock } from '@/lib/cache/redlock';
import { getRareSpeciesBySlug } from './rare-species-catalogue';
import type {
  MintLimitedEditionRequest,
  MintLimitedEditionResponse,
  LimitedEditionNftMetadata,
  NftAttribute,
} from '@/lib/types/limited-edition-nft';
import logger from '@/lib/logger';

// ── Redis helpers ─────────────────────────────────────────────────────────────

function getMintCountKey(speciesSlug: string): string {
  return `limited-edition:mint-count:${speciesSlug}`;
}

async function getRedisClient() {
  const client = createClient({ url: process.env.REDIS_URL });
  if (!client.isOpen) await client.connect();
  return client;
}

// ── Token ID derivation ───────────────────────────────────────────────────────

/**
 * Derives a deterministic token ID that incorporates the species slug so
 * limited-edition tokens are always distinct from standard certificate tokens
 * (which hash txHash + projectId without the species dimension).
 */
export function deriveLimitedEditionTokenId(
  txHash: string,
  donationId: string,
  speciesSlug: string,
  editionNumber: number
): string {
  return createHash('sha256')
    .update(`limited:${speciesSlug}:${editionNumber}:${txHash}:${donationId}`)
    .digest('hex');
}

// ── Metadata builder ──────────────────────────────────────────────────────────

function buildNftMetadata(
  req: MintLimitedEditionRequest,
  editionNumber: number,
  species: ReturnType<typeof getRareSpeciesBySlug> & object,
  tokenId: string,
  metadataBaseUrl: string
): LimitedEditionNftMetadata {
  const { speciesSlug, plantingDate, region, maxSupply, rarity, commonName, scientificName, iucnStatus, lore, imageUri } = {
    ...species,
    ...req,
  };

  const editionLabel = `${commonName} #${editionNumber} / ${species.maxSupply}`;

  const attributes: NftAttribute[] = [
    { trait_type: 'Species', value: commonName },
    { trait_type: 'Scientific Name', value: scientificName },
    { trait_type: 'IUCN Status', value: iucnStatus },
    { trait_type: 'Rarity', value: rarity.charAt(0).toUpperCase() + rarity.slice(1) },
    { trait_type: 'Edition Number', value: editionNumber, display_type: 'number' },
    { trait_type: 'Max Supply', value: species.maxSupply, display_type: 'number' },
    { trait_type: 'Region', value: region },
    { trait_type: 'Planting Date', value: Math.floor(new Date(plantingDate).getTime() / 1000), display_type: 'date' },
    { trait_type: 'Platform', value: 'Harvesta' },
    { trait_type: 'Blockchain', value: 'Stellar' },
    { trait_type: 'Token ID', value: tokenId.slice(0, 16) + '...' },
  ];

  return {
    name: editionLabel,
    description: lore,
    image: species.imageUri,
    externalUrl: `${metadataBaseUrl}/trees/${tokenId}`,
    attributes,
    platform: 'harvesta',
    schemaVersion: '1.0',
  };
}

// ── Mint orchestration ────────────────────────────────────────────────────────

export class SupplyExhaustedError extends Error {
  constructor(speciesSlug: string, maxSupply: number) {
    super(`SUPPLY_EXHAUSTED: All ${maxSupply} editions of "${speciesSlug}" have been minted`);
    this.name = 'SupplyExhaustedError';
  }
}

export class UnknownRareSpeciesError extends Error {
  constructor(speciesSlug: string) {
    super(`UNKNOWN_RARE_SPECIES: "${speciesSlug}" is not in the rare species catalogue`);
    this.name = 'UnknownRareSpeciesError';
  }
}

/**
 * Atomically reserves the next edition number and builds the Soroban mint
 * transaction for a limited-edition rare-species NFT.
 *
 * Uses Redis INCR for atomic edition-number assignment, combined with
 * Redlock (wallet lock) to prevent nonce collisions on the Stellar account.
 */
export async function mintLimitedEditionNft(
  req: MintLimitedEditionRequest,
  metadataBaseUrl: string,
  metadataDir: string
): Promise<MintLimitedEditionResponse> {
  const { speciesSlug, recipientAddress, txHash, donationId, plantingDate, region, network } = req;

  // 1. Validate species exists in catalogue
  const species = getRareSpeciesBySlug(speciesSlug);
  if (!species) throw new UnknownRareSpeciesError(speciesSlug);

  // 2. Validate network and contract
  const contractId = getMintingContractAddress(network);
  if (!contractId) throw new Error('CONTRACT_NOT_CONFIGURED');

  // 3. Validate recipient address
  if (!recipientAddress || !/^G[A-Z2-7]{55}$/.test(recipientAddress)) {
    throw new Error('INVALID_RECIPIENT_ADDRESS');
  }

  const redis = await getRedisClient();

  try {
    const countKey = getMintCountKey(speciesSlug);

    // 4. Atomically increment edition counter and check supply cap
    //    INCR returns the value AFTER incrementing, so edition #1 is the first mint.
    const newCount = await redis.incr(countKey);

    if (newCount > species.maxSupply) {
      // Rollback: decrement so we don't permanently burn an edition slot
      await redis.decr(countKey);
      throw new SupplyExhaustedError(speciesSlug, species.maxSupply);
    }

    const editionNumber = newCount;

    // 5. Derive token ID (edition-aware, distinct from standard certificate IDs)
    const tokenId = deriveLimitedEditionTokenId(txHash, donationId, speciesSlug, editionNumber);

    // 6. Build and store metadata
    const metadata = buildNftMetadata(req, editionNumber, species, tokenId, metadataBaseUrl);
    const metadataPath = `${metadataDir}/${tokenId}.json`;

    // Write metadata file (caller passes the directory path resolved to process.cwd())
    const fs = await import('fs');
    const fsPath = await import('path');
    const fullDir = fsPath.resolve(metadataDir);
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
    fs.writeFileSync(fsPath.join(fullDir, `${tokenId}.json`), JSON.stringify(metadata, null, 2));

    const metadataUri = `${metadataBaseUrl}/metadata/${tokenId}.json`;

    // 7. Build Soroban transaction with wallet lock
    const { transactionXdr, networkPassphrase } = await withWalletLock(
      recipientAddress,
      async () => {
        logger.info('[nft:limited-edition] Building mint tx', {
          speciesSlug,
          editionNumber,
          maxSupply: species.maxSupply,
          recipientAddress,
          tokenId,
        });
        return buildMintCertificateTransaction(recipientAddress, tokenId, metadataUri, network);
      },
      { ttlMs: 15_000, retryCount: 10 }
    );

    return {
      transactionXdr,
      networkPassphrase,
      tokenId,
      metadataUri,
      editionNumber,
      maxSupply: species.maxSupply,
      rarity: species.rarity,
      speciesCommonName: species.commonName,
      scientificName: species.scientificName,
    };
  } finally {
    await redis.quit();
  }
}

/**
 * Returns the current mint count for a species from Redis.
 * Returns 0 when no mints have occurred yet.
 */
export async function getMintCount(speciesSlug: string): Promise<number> {
  const redis = await getRedisClient();
  try {
    const val = await redis.get(getMintCountKey(speciesSlug));
    return val ? parseInt(val, 10) : 0;
  } finally {
    await redis.quit();
  }
}
