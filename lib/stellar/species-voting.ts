/**
 * Species Voting — On-chain governance for adding new tree species
 *
 * Token holders can propose and vote for new species to be added to the
 * species catalogue. Voting power is proportional to TREE token holdings.
 */

import {
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';
import { networkConfig } from '@/lib/config/network';

const TX_TIMEOUT_SECONDS = 300;

// ── Types ─────────────────────────────────────────────────────────────────────

export enum ProposalStatus {
  Active = 'active',
  Passed = 'passed',
  Rejected = 'rejected',
  Executed = 'executed',
}

export interface ProposalRecord {
  id: number;
  slug: string;
  name: string;
  co2_scaled: bigint;
  maturity_years: number;
  proposer: string;
  votes_for: bigint;
  votes_against: bigint;
  status: ProposalStatus;
  created_at: number;
  voting_ends_at: number;
}

export interface VoteRecord {
  voter: string;
  vote_for: boolean;
  power: bigint;
  voted_at: number;
}

// ── Contract configuration ─────────────────────────────────────────────────────

export const SPECIES_VOTING_CONTRACT_TESTNET =
  (process.env.NEXT_PUBLIC_SPECIES_VOTING_CONTRACT_TESTNET as string) ?? '';
export const SPECIES_VOTING_CONTRACT_MAINNET =
  (process.env.NEXT_PUBLIC_SPECIES_VOTING_CONTRACT_MAINNET as string) ?? '';

export function getSpeciesVotingContract(network: NetworkType): string {
  const address =
    network === 'mainnet' ? SPECIES_VOTING_CONTRACT_MAINNET : SPECIES_VOTING_CONTRACT_TESTNET;
  if (!address) {
    throw new Error(
      `Species voting contract not configured for ${network} network. Check your environment variables.`
    );
  }
  return address;
}

// ── Transaction builders ───────────────────────────────────────────────────────

/**
 * A generic helper to build a transaction for a contract call.
 * @private
 */
async function buildContractCallTransaction(
  userPublicKey: string,
  network: NetworkType,
  operation: xdr.Operation
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const userAccount = await server.loadAccount(userPublicKey);
  const networkPassphrase = networkConfig.networkPassphrase;

  const transaction = new TransactionBuilder(userAccount, {
    fee: BASE_FEE,
    networkPassphrase,
    timebounds: await server.fetchTimebounds(TX_TIMEOUT_SECONDS),
  })
    .addOperation(operation)
    .build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
  };
}

/**
 * Build a transaction to propose a new species.
 */
export async function buildProposeSpeciesTransaction(
  proposerPublicKey: string,
  slug: string,
  name: string,
  co2_scaled: bigint,
  maturity_years: number,
  network: NetworkType
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  if (co2_scaled <= BigInt(0)) {
    throw new Error('co2_scaled must be positive');
  }
  if (maturity_years === 0) {
    throw new Error('maturity_years must be > 0');
  }

  const contract = new Contract(getSpeciesVotingContract(network));
  const operation = contract.call(
    'propose_species',
    xdr.ScVal.scvString(slug),
    xdr.ScVal.scvString(name),
    nativeToScVal(co2_scaled, { type: 'i128' }),
    xdr.ScVal.scvU32(maturity_years)
  );

  return buildContractCallTransaction(proposerPublicKey, network, operation);
}

/**
 * Build a transaction to vote on a proposal.
 */
export async function buildVoteTransaction(
  voterPublicKey: string,
  proposalId: number,
  voteFor: boolean,
  network: NetworkType
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  const contract = new Contract(getSpeciesVotingContract(network));
  const operation = contract.call(
    'vote',
    xdr.ScVal.scvU32(proposalId),
    xdr.ScVal.scvBool(voteFor)
  );

  return buildContractCallTransaction(voterPublicKey, network, operation);
}

/**
 * Build a transaction to execute a passed proposal.
 */
export async function buildExecuteProposalTransaction(
  executorPublicKey: string,
  proposalId: number,
  network: NetworkType
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  const contract = new Contract(getSpeciesVotingContract(network));
  const operation = contract.call('execute_proposal', xdr.ScVal.scvU32(proposalId));

  return buildContractCallTransaction(executorPublicKey, network, operation);
}

// ── Read-only Functions ───────────────────────────────────────────────────────

/**
 * Fetches a single proposal's details from the contract.
 * This is a read-only operation and does not require a transaction.
 */
export async function getProposal(
  proposalId: number,
  network: NetworkType
): Promise<ProposalRecord> {
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const contract = new Contract(getSpeciesVotingContract(network));

  // Prepare the read-only contract call
  const operation = contract.call('get_proposal', xdr.ScVal.scvU32(proposalId));

  // Use `server.call()` for read-only invocations. This is a simulation.
  const result = await (server as any).call(operation);

  if (result.status !== 'SUCCESS' || !result.returnValue) {
    throw new Error(`Failed to fetch proposal #${proposalId}.`);
  }

  // The return value from the contract is in XDR format; it must be converted to a native JS type.
  const parsedResult = scValToNative(result.returnValue);

  // IMPORTANT: The `parsedResult` will be a raw object or map from the contract.
  // You must manually map its properties to your `ProposalRecord` interface,
  // ensuring types like `bigint` are handled correctly.
  // For example: `votes_for: BigInt(parsedResult.votes_for)`
  console.info('Raw proposal data from contract:', parsedResult);

  return parsedResult as ProposalRecord;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calculate the percentage of votes in favor.
 */
export function calculateVotePercentage(votesFor: bigint | number, votesAgainst: bigint | number): number {
  const forVotes = typeof votesFor === 'bigint' ? votesFor : BigInt(Math.round(votesFor));
  const againstVotes = typeof votesAgainst === 'bigint' ? votesAgainst : BigInt(Math.round(votesAgainst));
  const total = forVotes + againstVotes;
  if (total === BigInt(0)) return 0;

  return Number((forVotes * BigInt(10000)) / total) / 100;
}

/**
 * Check if a proposal is still within its voting period.
 */
export function isVotingActive(votingEndsAt: number): boolean {
  return Date.now() / 1000 < votingEndsAt;
}

/**
 * Format the remaining voting time.
 */
export function formatVotingTimeRemaining(votingEndsAt: number): string {
  const now = Date.now() / 1000;
  const remaining = votingEndsAt - now;

  if (remaining <= 0) return 'Voting ended';

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} remaining`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
  return 'Less than 1 hour remaining';
}
