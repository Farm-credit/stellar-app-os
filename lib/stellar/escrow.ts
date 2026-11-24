import { Networks, TransactionBuilder, Operation, Keypair, Memo } from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import { getUsdcAsset, getStellarExplorerUrl } from '@/lib/stellar/transaction';
import { calculateVerifierRewardSplit } from '@/lib/escrow/milestone-finalization';
import type { NetworkType } from '@/lib/types/wallet';
import type { MilestoneFinalizationRecord, MilestoneReleaseResponse } from '@/lib/types/escrow';

const MILESTONE_RELEASE_PERCENT = 0.75;

function getHorizonUrl(network: NetworkType): string {
  return network === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';
}

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

export interface EscrowReleaseOptions {
  verifierWalletAddress?: string;
  milestoneId?: number;
}

/**
 * Submits a Stellar USDC disbursement for a milestone amount. When
 * `verifierWalletAddress` is supplied, splits the disbursement atomically
 * in one transaction: 2% (200 bps) to the approving verifier and the net
 * remainder (including integer stroop dust) to the farmer.
 */
export async function submitMilestoneDisbursement(
  disbursementAmountUsdc: number,
  farmerWalletAddress: string,
  escrowSecretKey: string,
  network: NetworkType,
  loanId: string,
  options: EscrowReleaseOptions = {}
): Promise<MilestoneReleaseResponse> {
  if (!Number.isFinite(disbursementAmountUsdc) || disbursementAmountUsdc <= 0) {
    throw new Error('Disbursement amount must be positive');
  }

  const verifierWalletAddress = options.verifierWalletAddress?.trim();
  if (options.verifierWalletAddress !== undefined && !verifierWalletAddress) {
    throw new Error('verifierWalletAddress must not be empty');
  }

  const milestoneId = options.milestoneId ?? 1;
  const horizonUrl = getHorizonUrl(network);
  const networkPassphrase = getNetworkPassphrase(network);
  const server = new Horizon.Server(horizonUrl);

  const escrowKeypair = Keypair.fromSecret(escrowSecretKey);
  const escrowPublicKey = escrowKeypair.publicKey();

  const escrowAccount = await server.loadAccount(escrowPublicKey);
  const usdcAsset = getUsdcAsset(network);

  const split = verifierWalletAddress
    ? calculateVerifierRewardSplit(disbursementAmountUsdc)
    : undefined;
  const farmerPayoutUsdc = split ? split.farmerPayoutUsdc : disbursementAmountUsdc;
  const verifierRewardUsdc = split ? split.verifierRewardUsdc : 0;

  const builder = new TransactionBuilder(escrowAccount, {
    fee: '100',
    networkPassphrase,
  }).addOperation(
    Operation.payment({
      destination: farmerWalletAddress,
      asset: usdcAsset,
      amount: farmerPayoutUsdc.toFixed(7),
    })
  );

  if (verifierWalletAddress && split && split.verifierRewardStroops > 0n) {
    builder.addOperation(
      Operation.payment({
        destination: verifierWalletAddress,
        asset: usdcAsset,
        amount: verifierRewardUsdc.toFixed(7),
      })
    );
  }

  const transaction = builder
    .addMemo(Memo.text(`milestone-${milestoneId}:${loanId}`))
    .setTimeout(300)
    .build();

  transaction.sign(escrowKeypair);

  const signedXdr = transaction.toEnvelope().toXDR('base64');

  const response = await fetch(`${horizonUrl}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(signedXdr)}`,
  });

  if (!response.ok) {
    const err = (await response.json()) as {
      extras?: { result_codes?: { transaction?: string } };
      detail?: string;
    };
    const msg =
      err.extras?.result_codes?.transaction ?? err.detail ?? 'Escrow release transaction failed';
    throw new Error(msg);
  }

  const result = (await response.json()) as { hash: string };

  return {
    transactionHash: result.hash,
    releasedAmountUsdc: split ? split.totalDisbursementUsdc : disbursementAmountUsdc,
    farmerWalletAddress,
    explorerUrl: getStellarExplorerUrl(result.hash, network),
    ...(verifierWalletAddress
      ? {
          farmerPayoutUsdc,
          verifierWalletAddress,
          verifierRewardUsdc,
        }
      : {}),
  };
}

/**
 * Builds and submits a 75% escrow release transaction to the farmer's wallet
 * (and optional 2% verifier reward split when `options.verifierWalletAddress`
 * is provided).
 */
export async function buildAndSubmitEscrowRelease(
  totalEscrowAmountUsdc: number,
  farmerWalletAddress: string,
  escrowSecretKey: string,
  network: NetworkType,
  loanId: string,
  options: EscrowReleaseOptions = {}
): Promise<MilestoneReleaseResponse> {
  const releaseAmount = totalEscrowAmountUsdc * MILESTONE_RELEASE_PERCENT;
  return submitMilestoneDisbursement(
    releaseAmount,
    farmerWalletAddress,
    escrowSecretKey,
    network,
    loanId,
    options
  );
}

/**
 * Executes an approved milestone finalization payout on Stellar after grace
 * period expiry, routing 2% to the approving verifier and net remainder to
 * the farmer.
 */
export async function executeMilestoneFinalizationOnStellar(
  record: MilestoneFinalizationRecord
): Promise<{ transactionHash: string; explorerUrl: string }> {
  if (!record.escrowSecretKey) {
    throw new Error('escrowSecretKey is required to execute on-chain Stellar payout');
  }
  const result = await submitMilestoneDisbursement(
    record.totalDisbursementUsdc,
    record.farmerWalletAddress,
    record.escrowSecretKey,
    record.network,
    record.loanId,
    {
      verifierWalletAddress: record.approvingVerifierAddress,
      milestoneId: record.milestoneId,
    }
  );
  return {
    transactionHash: result.transactionHash,
    explorerUrl: result.explorerUrl,
  };
}
