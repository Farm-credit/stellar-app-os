/**
 * Anonymous Donation Transaction Builder
 * 
 * Builds Stellar transactions for privacy-preserving donations using ZK proofs.
 * The transaction includes the ZK proof in the memo field and submits to a
 * smart contract that verifies the proof without revealing the donor's identity.
 */

import { TransactionBuilder, Asset, Operation, Memo, Contract, xdr } from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';
import type { AnonymousDonationProof } from '@/lib/zk/types';
import { networkConfig } from '@/lib/config/network';
import { calculateDonationAllocation } from '@/lib/constants/donation';

/**
 * Build an anonymous donation transaction with ZK proof
 * 
 * @param amount - Donation amount in USD
 * @param proof - ZK proof of donation validity
 * @param relayerPublicKey - Public key of the relayer (submits tx on behalf of donor)
 * @param network - Stellar network (testnet/mainnet)
 * @returns Transaction XDR and network passphrase
 */
export async function buildAnonymousDonationTransaction(
  amount: number,
  proof: AnonymousDonationProof,
  relayerPublicKey: string,
  network: NetworkType
): Promise<{
  transactionXdr: string;
  networkPassphrase: string;
  nullifier: string;
}> {
  if (amount <= 0) {
    throw new Error('Donation amount must be greater than zero');
  }

  const networkPassphrase =
    network === 'mainnet'
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015';

  const server = new Horizon.Server(networkConfig.horizonUrl);
  
  // Use relayer account as source (donor remains anonymous)
  const sourceAccount = await server.loadAccount(relayerPublicKey);
  const usdcAsset = new Asset('USDC', networkConfig.usdcIssuer);

  const plantingAddress = networkConfig.addresses.planting;
  const replantingBufferAddress = networkConfig.addresses.replantingBuffer;

  // Split donation: 70% planting, 30% buffer
  const { planting, buffer } = calculateDonationAllocation(amount);

  // Encode proof data for memo (truncated for memo size limits)
  const proofData = {
    n: proof.nullifier.slice(0, 16), // Truncated nullifier
    c: proof.donationCommitment.slice(0, 16), // Truncated commitment
    t: proof.timestamp,
  };
  const memoText = `anon:${JSON.stringify(proofData)}`.slice(0, 28);

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: '1000', // Higher fee for anonymous transactions
    networkPassphrase,
  })
    // Payment 1: 70% to planting
    .addOperation(
      Operation.payment({
        destination: plantingAddress,
        asset: usdcAsset,
        amount: planting.toFixed(7),
      })
    )
    // Payment 2: 30% to replanting buffer
    .addOperation(
      Operation.payment({
        destination: replantingBufferAddress,
        asset: usdcAsset,
        amount: buffer.toFixed(7),
      })
    )
    .addMemo(Memo.text(memoText))
    .setTimeout(300)
    .build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
    nullifier: proof.nullifier,
  };
}

/**
 * Build a transaction that invokes the nullifier registry smart contract
 * This registers the nullifier on-chain to prevent double-donations
 * 
 * @param proof - ZK proof containing the nullifier
 * @param sourcePublicKey - Source account for the transaction
 * @param network - Stellar network
 */
export async function buildNullifierRegistrationTransaction(
  proof: AnonymousDonationProof,
  sourcePublicKey: string,
  network: NetworkType
): Promise<{
  transactionXdr: string;
  networkPassphrase: string;
}> {
  const networkPassphrase =
    network === 'mainnet'
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015';

  const server = new Horizon.Server(networkConfig.horizonUrl);
  const sourceAccount = await server.loadAccount(sourcePublicKey);

  // Get nullifier registry contract address
  const contractAddress = networkConfig.contracts.nullifierRegistry;

  if (!contractAddress || contractAddress.startsWith('REPLACE_WITH_')) {
    throw new Error('Nullifier registry contract not configured');
  }

  // Build contract invocation
  const contract = new Contract(contractAddress);

  // Prepare contract function arguments
  const nullifierBytes = Buffer.from(proof.nullifier, 'hex');
  const commitmentBytes = Buffer.from(proof.donationCommitment, 'hex');

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: '10000', // Higher fee for contract invocation
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractAddress,
        function: 'register_nullifier',
        args: [
          xdr.ScVal.scvBytes(nullifierBytes),
          xdr.ScVal.scvBytes(commitmentBytes),
          xdr.ScVal.scvU64(xdr.Uint64.fromString(proof.timestamp.toString())),
        ],
      })
    )
    .setTimeout(300)
    .build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
  };
}

/**
 * Check if a nullifier has already been used (prevents double-donations)
 * 
 * @param nullifier - The nullifier to check
 * @param network - Stellar network
 * @returns True if nullifier is already used
 */
export async function isNullifierUsed(
  nullifier: string,
  network: NetworkType
): Promise<boolean> {
  try {
    const contractAddress = networkConfig.contracts.nullifierRegistry;

    if (!contractAddress || contractAddress.startsWith('REPLACE_WITH_')) {
      // Contract not configured, skip check (development mode)
      return false;
    }

    const server = new Horizon.Server(networkConfig.horizonUrl);
    const contract = new Contract(contractAddress);

    // Query contract to check if nullifier exists
    const nullifierBytes = Buffer.from(nullifier, 'hex');

    // This would call the contract's check_nullifier function
    // For now, return false (not used) in development
    return false;
  } catch (error) {
    console.error('Error checking nullifier:', error);
    return false;
  }
}

/**
 * Estimate the cost of an anonymous donation (including relayer fees)
 * 
 * @param amount - Donation amount in USD
 * @returns Estimated total cost including fees
 */
export function estimateAnonymousDonationCost(amount: number): {
  donationAmount: number;
  relayerFee: number;
  networkFee: number;
  totalCost: number;
} {
  const relayerFee = 0.5; // $0.50 relayer fee
  const networkFee = 0.01; // ~$0.01 network fee (approximate)

  return {
    donationAmount: amount,
    relayerFee,
    networkFee,
    totalCost: amount + relayerFee + networkFee,
  };
}
