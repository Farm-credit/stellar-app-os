import { TransactionBuilder, Asset, Operation, Memo, hash, BASE_FEE } from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';
import type {
  CreditSelectionState,
  BulkPurchaseOrder,
  BulkPurchaseResult,
} from '@/lib/types/carbon';
import { calculateDonationAllocation } from '@/lib/constants/donation';
import { networkConfig } from '@/lib/config/network';
import { getTreeAsset } from './tree-asset';
import { DEFAULT_CONVERSION_SLIPPAGE, computeSendMax, getXlmPerUsdcRate } from './conversion';
import type { DonationAsset } from '@/lib/types/donation-payment';
import { getRegionPlanterAddresses } from './region-pools';

// Re-export so callers can import TREE asset helper from this module
export { getTreeAsset };

export function getNetworkPassphrase(_network?: NetworkType): string {
  return networkConfig.networkPassphrase;
}

export function getUsdcAsset(_network?: NetworkType): Asset {
  return new Asset('USDC', networkConfig.usdcIssuer);
}

export function getUsdtAsset(_network?: NetworkType): Asset {
  return new Asset('USDT', networkConfig.usdtIssuer);
}

export function getEurcAsset(_network?: NetworkType): Asset {
  return new Asset('EURC', networkConfig.eurcIssuer);
}

function getDonationPaymentAsset(asset: DonationAsset, network?: NetworkType): Asset {
  switch (asset) {
    case 'USDC':
      return getUsdcAsset(network);
    case 'USDT':
      return getUsdtAsset(network);
    case 'EURC':
      return getEurcAsset(network);
    default:
      throw new Error(`No direct asset exists for ${asset}`);
  }
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

  // Payment transaction: transfers USDC to the platform's bulk-recipient address.
  // TREE token minting (one TREE per credit purchased) is performed server-side
  // via buildTreeMintTransaction() in lib/stellar/tree-token.ts once this
  // transaction is confirmed on-chain.
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

export interface DonationTransactionResult {
  transactionXdr: string;
  networkPassphrase: string;
  /** Payment asset the donor's account is debited in. */
  asset: DonationAsset;
  /**
   * Amount debited from the donor, in the payment asset. For USDC this is the
   * total donation; for XLM it is the `sendMax` ceiling (quote + slippage).
   */
  estimatedSourceAmount: string;
}

/**
 * Build a single Stellar transaction that funds N tree slots.
 *
 * Gas efficiency: one transaction, one fee (100 * 2N stroops), one signature.
 * Each tree produces two operations: 70% to planting escrow, 30% to buffer fund.
 *
 * Escrow accounting is always denominated in USDC. When `asset` is 'XLM' the
 * donor pays XLM and each operation becomes a strict-receive path payment that
 * converts XLM → USDC on the Stellar DEX, so the escrow receives the exact USDC
 * allocation while the donor's XLM cost is bounded by a slippage-padded `sendMax`.
 *
 * Supports:
 * - Multi-asset (USDC, USDT, EURC direct; XLM via DEX)
 * - Region-based planter pool splitting (if regionId provided)
 *
 * @param amount             - Per-tree donation amount in USD (escrow credited in USDC)
 * @param sourcePublicKey    - Donor Stellar public key
 * @param network            - testnet | mainnet
 * @param idempotencyKey     - Unique idempotency key
 * @param treeCount          - Number of trees (1–50)
 * @param asset              - Payment asset: stablecoin (direct) or XLM (converted)
 * @param slippageTolerance  - Slippage allowance for the XLM→USDC conversion
 * @param regionId           - Optional region ID for planter pool splitting
 */
export async function buildDonationTransaction(
  amount: number,
  sourcePublicKey: string,
  network: NetworkType,
  idempotencyKey: string,
  treeCount = 1,
  asset: DonationAsset = 'USDC',
  slippageTolerance: number = DEFAULT_CONVERSION_SLIPPAGE,
  regionId?: string
): Promise<DonationTransactionResult> {
  const normalizedAsset = asset.toUpperCase() as DonationAsset;
  const normalizedRegionId = regionId?.trim() || undefined;

  if (amount <= 0) {
    throw new Error('Donation amount must be greater than zero');
  }
  if (treeCount < 1 || treeCount > MAX_BATCH_TREES) {
    throw new Error(`Tree count must be between 1 and ${MAX_BATCH_TREES}`);
  }
  if (!['USDC', 'USDT', 'EURC', 'XLM'].includes(normalizedAsset)) {
    throw new Error(`Unsupported donation asset: ${asset}`);
  }

  const networkPassphrase = getNetworkPassphrase(network);
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const sourceAccount = await server.loadAccount(sourcePublicKey);
  const usdcAsset = getUsdcAsset(network);

  const builder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  });

  let estimatedSourceAmount: string;
  const regionPlanterAddresses = getRegionPlanterAddresses(normalizedRegionId);

  if (normalizedAsset !== 'XLM') {
    const paymentAsset = getDonationPaymentAsset(normalizedAsset, network);
    // Direct stablecoin payments: 70% to planting escrow + 30% buffer.
    for (let i = 0; i < treeCount; i++) {
      const { planting, buffer } = calculateDonationAllocation(amount);

      if (regionPlanterAddresses.length > 0) {
        const planterCount = regionPlanterAddresses.length;
        const baseShare = Math.floor((planting / planterCount) * 1e7) / 1e7;
        for (let j = 0; j < planterCount; j += 1) {
          const amountForPlanter =
            j === 0
              ? parseFloat((planting - baseShare * (planterCount - 1)).toFixed(7))
              : baseShare;
          builder.addOperation(
            Operation.payment({
              destination: regionPlanterAddresses[j],
              asset: paymentAsset,
              amount: amountForPlanter.toFixed(7),
            })
          );
        }
      } else {
        builder.addOperation(
          Operation.payment({
            destination: PLANTING_ADDRESS,
            asset: paymentAsset,
            amount: planting.toFixed(7),
          })
        );
      }

      builder.addOperation(
        Operation.payment({
          destination: REPLANTING_BUFFER_ADDRESS,
          asset: paymentAsset,
          amount: buffer.toFixed(7),
        })
      );
    }
    estimatedSourceAmount = (amount * treeCount).toFixed(7);
  } else {
    // XLM → USDC via path payments
    const totalUsdc = amount * treeCount;
    const xlmPerUsdc = await getXlmPerUsdcRate(totalUsdc, network);

    let totalSendMax = 0;

    for (let i = 0; i < treeCount; i++) {
      const { planting, buffer } = calculateDonationAllocation(amount);
      const bufferMax = computeSendMax(buffer, xlmPerUsdc, slippageTolerance);
      totalSendMax += parseFloat(bufferMax);

      if (regionPlanterAddresses.length > 0) {
        const planterCount = regionPlanterAddresses.length;
        const baseShare = Math.floor((planting / planterCount) * 1e7) / 1e7;
        for (let j = 0; j < planterCount; j += 1) {
          const amountForPlanter =
            j === 0
              ? parseFloat((planting - baseShare * (planterCount - 1)).toFixed(7))
              : baseShare;
          const planterMax = computeSendMax(amountForPlanter, xlmPerUsdc, slippageTolerance);
          totalSendMax += parseFloat(planterMax);
          builder.addOperation(
            Operation.pathPaymentStrictReceive({
              sendAsset: Asset.native(),
              sendMax: planterMax,
              destination: regionPlanterAddresses[j],
              destAsset: usdcAsset,
              destAmount: amountForPlanter.toFixed(7),
              path: [],
            })
          );
        }
      } else {
        const plantingMax = computeSendMax(planting, xlmPerUsdc, slippageTolerance);
        totalSendMax += parseFloat(plantingMax);
        builder.addOperation(
          Operation.pathPaymentStrictReceive({
            sendAsset: Asset.native(),
            sendMax: plantingMax,
            destination: PLANTING_ADDRESS,
            destAsset: usdcAsset,
            destAmount: planting.toFixed(7),
            path: [],
          })
        );
      }

      builder.addOperation(
        Operation.pathPaymentStrictReceive({
          sendAsset: Asset.native(),
          sendMax: bufferMax,
          destination: REPLANTING_BUFFER_ADDRESS,
          destAsset: usdcAsset,
          destAmount: buffer.toFixed(7),
          path: [],
        })
      );
    }
    estimatedSourceAmount = totalSendMax.toFixed(7);
  }

  const transaction = builder
    .addMemo(Memo.text(`donate:${idempotencyKey.slice(0, 20)}`))
    .setTimeout(300)
    .build();

  console.info('[stellar] Built donation transaction', {
    sourcePublicKey,
    treeCount,
    asset: normalizedAsset,
    regionId: regionId ?? 'none',
  });

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
    asset: normalizedAsset,
    estimatedSourceAmount,
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

  console.info('[stellar] Built bulk purchase transaction', {
    projectId,
    quantity,
    buyerPublicKey,
  });

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
    ipfsCid,
    memoValue,
  };
}
