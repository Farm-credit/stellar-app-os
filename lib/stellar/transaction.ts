import { TransactionBuilder, Asset, Operation, Memo, hash } from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';
import type {
  CreditSelectionState,
  BulkPurchaseOrder,
  BulkPurchaseResult,
} from '@/lib/types/carbon';
import { calculateDonationAllocation } from '@/lib/constants/donation';
import { networkConfig } from '@/lib/config/network';

export function getNetworkPassphrase(_network?: NetworkType): string {
  return networkConfig.networkPassphrase;
}

export function getUsdcAsset(_network?: NetworkType): Asset {
  return new Asset('USDC', networkConfig.usdcIssuer);
}

export function getCarbonCreditAsset(_network?: NetworkType): Asset {
  return new Asset('CARBON', networkConfig.carbonCreditIssuer);
}

export async function buildPaymentTransaction(
  selection: CreditSelectionState,
  sourcePublicKey: string,
  network: NetworkType,
  idempotencyKey: string
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  if (!selection.projectId || selection.quantity <= 0 || selection.calculatedPrice <= 0) {
    throw new Error('Invalid selection for transaction');
  }

  const networkPassphrase = getNetworkPassphrase(network);
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const sourceAccount = await server.loadAccount(sourcePublicKey);

  const usdcAsset = getUsdcAsset(network);
  const recipientAddress = networkConfig.addresses.bulkRecipient;

  // Dev version: Only process payment, skip carbon credit minting (no asset exists yet)
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: recipientAddress,
        asset: usdcAsset,
        amount: selection.calculatedPrice.toFixed(7),
      })
    )
    .addMemo(Memo.text(idempotencyKey))
    .setTimeout(300)
    .build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
  };
}

export async function submitTransaction(
  signedTransactionXdr: string,
  _network?: NetworkType
): Promise<string> {
  const horizonUrl = networkConfig.horizonUrl;

  const response = await fetch(`${horizonUrl}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `tx=${encodeURIComponent(signedTransactionXdr)}`,
  });

  if (!response.ok) {
    const errorData = (await response.json()) as {
      extras?: {
        result_codes?: {
          transaction?: string;
          operations?: string[];
        };
        result_xdr?: string;
      };
      detail?: string;
      type?: string;
    };

    // Build detailed error message
    let errorMessage = 'Transaction submission failed';

    if (errorData.extras?.result_codes?.transaction) {
      errorMessage = `Transaction failed: ${errorData.extras.result_codes.transaction}`;

      // Add operation-level errors if available
      if (
        errorData.extras.result_codes.operations &&
        errorData.extras.result_codes.operations.length > 0
      ) {
        const operationErrors = errorData.extras.result_codes.operations.filter(
          (op) => op !== 'op_success'
        );
        if (operationErrors.length > 0) {
          errorMessage += ` (Operations: ${operationErrors.join(', ')})`;
        }
      }
    } else if (errorData.detail) {
      errorMessage = errorData.detail;
    } else if (errorData.type) {
      errorMessage = errorData.type;
    }

    throw new Error(errorMessage);
  }

  const result = (await response.json()) as { hash: string };
  return result.hash;
}

// Replanting buffer fund address — receives 30% of each donation
const REPLANTING_BUFFER_ADDRESS = networkConfig.addresses.replantingBuffer;

// Planting escrow address — receives 70% of each donation
const PLANTING_ADDRESS = 'GABEMKJNR4GK7M4FROGA7I7PG63N2CKE3EGDSBSISG56SVL2O3KRNDXA';

/** Maximum trees per batch — mirrors the contract's MAX_BATCH_SIZE */
export const MAX_BATCH_TREES = 50;

/**
 * Build a single Stellar transaction that funds N tree slots.
 *
 * Gas efficiency: one transaction, one fee (100 * 2N stroops), one signature.
 * Each tree produces two operations: 70% to planting escrow, 30% to buffer fund.
 *
 * @param amount     - Per-tree donation amount in USD (sent as USDC)
 * @param treeCount  - Number of trees (1–50)
 */
export async function buildDonationTransaction(
  amount: number,
  sourcePublicKey: string,
  network: NetworkType,
  idempotencyKey: string,
  treeCount = 1
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  if (amount <= 0) {
    throw new Error('Donation amount must be greater than zero');
  }
  if (treeCount < 1 || treeCount > MAX_BATCH_TREES) {
    throw new Error(`Tree count must be between 1 and ${MAX_BATCH_TREES}`);
  }

  const networkPassphrase = getNetworkPassphrase(network);
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const sourceAccount = await server.loadAccount(sourcePublicKey);
  const usdcAsset = getUsdcAsset(network);

  const plantingAddress = networkConfig.addresses.planting;

  // Split: 70% to planting, 30% to replanting buffer fund
  const { planting, buffer } = calculateDonationAllocation(amount);

  const builder = new TransactionBuilder(sourceAccount, {
    fee: baseFee,
    networkPassphrase,
  });

  // Add two operations per tree: 70% planting + 30% buffer
  for (let i = 0; i < treeCount; i++) {
    const { planting, buffer } = calculateDonationAllocation(amount);
    builder
      .addOperation(
        Operation.payment({
          destination: PLANTING_ADDRESS,
          asset: usdcAsset,
          amount: planting.toFixed(7),
        })
      )
      .addOperation(
        Operation.payment({
          destination: REPLANTING_BUFFER_ADDRESS,
          asset: usdcAsset,
          amount: buffer.toFixed(7),
        })
      );
  }

  const transaction = builder
    .addMemo(Memo.text(`donate:${idempotencyKey.slice(0, 20)}`))
    .setTimeout(300)
    .build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
  };
}

export function getStellarExplorerUrl(transactionHash: string, network?: NetworkType): string {
  const net = network ?? networkConfig.network;
  const networkParam = net === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${networkParam}/tx/${transactionHash}`;
}

// ─── Bulk / Corporate Purchase ────────────────────────────────────────────────

/**
 * Builds a bulk-purchase transaction for corporate buyers (≥ 1 000 tokens).
 *
 * Metadata handling:
 *  - 'on-chain'  → SHA-256 hash of the JSON metadata is embedded as a Memo.hash
 *  - 'ipfs'      → caller is expected to pin the metadata first; the returned
 *                  `memoValue` is the first 28 chars of the CID for the memo text
 *  - 'none'      → plain text memo with the order reference
 */
export async function buildBulkPurchaseTransaction(
  order: BulkPurchaseOrder
): Promise<BulkPurchaseResult> {
  const { projectId, quantity, totalPrice, buyerPublicKey, network, metadata } = order;

  if (quantity < 1000) throw new Error('Bulk purchase requires at least 1 000 tokens');
  if (totalPrice <= 0) throw new Error('Total price must be greater than zero');

  const networkPassphrase = getNetworkPassphrase(network);
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const sourceAccount = await server.loadAccount(buyerPublicKey);
  const usdcAsset = getUsdcAsset(network);
  const recipient = networkConfig.addresses.bulkRecipient;

  // Build memo based on metadata storage preference
  let memo: Memo;
  let ipfsCid: string | undefined;
  let memoValue: string | undefined;

  if (metadata?.storageType === 'on-chain') {
    // Hash the metadata JSON and embed it as a 32-byte memo hash
    const metaJson = JSON.stringify({
      companyName: metadata.companyName,
      initiativeDescription: metadata.initiativeDescription,
      initiativeUrl: metadata.initiativeUrl,
      projectId,
      quantity,
    });
    const metaHash = hash(Buffer.from(metaJson, 'utf8'));
    memo = Memo.hash(metaHash.toString('hex'));
    memoValue = metaHash.toString('hex');
  } else if (metadata?.storageType === 'ipfs') {
    // The IPFS CID is provided via metadata.storageRef (pinned before calling this fn)
    const cid = metadata.storageRef ?? '';
    ipfsCid = cid;
    // Stellar memo text is max 28 bytes; prefix with 'ipfs:' and truncate
    memoValue = `ipfs:${cid}`.slice(0, 28);
    memo = Memo.text(memoValue);
  } else {
    // No metadata — simple reference memo
    memoValue = `bulk:${projectId}`.slice(0, 28);
    memo = Memo.text(memoValue);
  }

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: '1000', // higher base fee for bulk ops
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: recipient,
        asset: usdcAsset,
        amount: totalPrice.toFixed(7),
      })
    )
    .addMemo(memo)
    .setTimeout(300)
    .build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
    ipfsCid,
    memoValue,
  };
}
