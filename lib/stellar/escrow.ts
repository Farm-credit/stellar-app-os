import { Networks, TransactionBuilder, Operation, Keypair, Memo } from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import { getUsdcAsset, getStellarExplorerUrl } from '@/lib/stellar/transaction';
import type { NetworkType } from '@/lib/types/wallet';
import type { MilestoneReleaseResponse } from '@/lib/types/escrow';

const MILESTONE_RELEASE_PERCENT = 0.75;

function getHorizonUrl(network: NetworkType): string {
  return network === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';
}

function getNetworkPassphrase(network: NetworkType): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

/**
 * Builds and submits a 75% escrow release transaction to the farmer's wallet.
 * The escrow account signs the transaction server-side using the escrow secret key.
 */
export async function buildAndSubmitEscrowRelease(
  totalEscrowAmountUsdc: number,
  farmerWalletAddress: string,
  escrowSecretKey: string,
  network: NetworkType,
  loanId: string
): Promise<MilestoneReleaseResponse> {
  const releaseAmount = totalEscrowAmountUsdc * MILESTONE_RELEASE_PERCENT;
  const releaseAmountStr = releaseAmount.toFixed(7);

  const horizonUrl = getHorizonUrl(network);
  const networkPassphrase = getNetworkPassphrase(network);
  const server = new Horizon.Server(horizonUrl);

  const escrowKeypair = Keypair.fromSecret(escrowSecretKey);
  const escrowPublicKey = escrowKeypair.publicKey();

  const escrowAccount = await server.loadAccount(escrowPublicKey);
  const usdcAsset = getUsdcAsset(network);

  const transaction = new TransactionBuilder(escrowAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: farmerWalletAddress,
        asset: usdcAsset,
        amount: releaseAmountStr,
      })
    )
    .addMemo(Memo.text(`milestone-1:${loanId}`))
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
    releasedAmountUsdc: releaseAmount,
    farmerWalletAddress,
    explorerUrl: getStellarExplorerUrl(result.hash, network),
  };
}
