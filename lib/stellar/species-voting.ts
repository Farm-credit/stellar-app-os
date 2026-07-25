/**
 * Species Voting — On-chain governance for adding new tree species
 *
 * Token holders can propose and vote for new species to be added to the
 * species catalogue. Voting power is proportional to TREE token holdings.
 */

import { TransactionBuilder, Operation, BASE_FEE, Contract } from '@stellar/stellar-sdk';
import { TransactionBuilder, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import { TransactionBuilder, Operation, BASE_FEE, xdr, Address } from '@stellar/stellar-sdk';
import {
  TransactionBuilder,
  BASE_FEE,
  type xdr,
  Contract,
  scValToNative,
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
    network === 'mainnet'
      ? SPECIES_VOTING_CONTRACT_MAINNET
      : SPECIES_VOTING_CONTRACT_TESTNET;
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
  _network: NetworkType
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  if (co2_scaled <= 0n) {
    throw new Error('co2_scaled must be positive');
  }
  if (maturity_years === 0) {
    throw new Error('maturity_years must be > 0');
  }

  const server = new Horizon.Server(networkConfig.horizonUrl);
  const proposerAccount = await server.loadAccount(proposerPublicKey);
  const networkPassphrase = networkConfig.networkPassphrase;

  // TODO: Replace with actual Soroban contract invocation
  const transaction = new TransactionBuilder(proposerAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      new Contract(getSpeciesVotingContract(network)).call(
        'propose_species'
      )
      Operation.invokeHostFunction({
        func: {
          args: [
            // Contract function args will go here
          ],
          auth: [],
        },
        hostFunction: {
          type: 'invokeContract',
          contractId: getSpeciesVotingContract(network),
          functionName: 'propose_species',
        },
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: new Address(getSpeciesVotingContract(network)).toScAddress(),
            functionName: 'propose_species',
            args: [],
          })
        ),
        auth: [],
      })
    )
    .setTimeout(300)
    .build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
  };
  const contract = new Contract(getSpeciesVotingContract(network));
  const operation = contract.call('propose_species', {
    // Using named arguments improves readability and type safety
    slug,
    name,
    co2_scaled,
    maturity_years,
    // The SDK handles the `proposer` argument implicitly if the contract
    // uses `require_auth()`. If not, add `proposer: new Address(proposerPublicKey)`
  });

  return buildContractCallTransaction(proposerPublicKey, network, operation);
}

/**
 * Build a transaction to vote on a proposal.
 */
export async function buildVoteTransaction(
  voterPublicKey: string,
  _proposalId: number,
  _voteFor: boolean,
  _network: NetworkType
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const voterAccount = await server.loadAccount(voterPublicKey);
  const networkPassphrase = networkConfig.networkPassphrase;

  // TODO: Replace with actual Soroban contract invocation
  const transaction = new TransactionBuilder(voterAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      new Contract(getSpeciesVotingContract(network)).call(
        'vote'
      )
      Operation.invokeHostFunction({
        func: {
          args: [],
          auth: [],
        },
        hostFunction: {
          type: 'invokeContract',
          contractId: getSpeciesVotingContract(network),
          functionName: 'vote',
        },
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: new Address(getSpeciesVotingContract(network)).toScAddress(),
            functionName: 'vote',
            args: [],
          })
        ),
        auth: [],
      })
    )
    .setTimeout(300)
    .build();

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
  };
  const contract = new Contract(getSpeciesVotingContract(network));
  const operation = contract.call('vote', {
    // The SDK handles the `voter` argument implicitly if using `require_auth()`
    proposal_id: proposalId,
    vote_for: voteFor,
  });

  return buildContractCallTransaction(voterPublicKey, network, operation);
}

/**
 * Build a transaction to execute a passed proposal.
 */
export async function buildExecuteProposalTransaction(
  executorPublicKey: string,
  _proposalId: number,
  _network: NetworkType
): Promise<{ transactionXdr: string; networkPassphrase: string }> {
  const contract = new Contract(getSpeciesVotingContract(network));
  const operation = contract.call('execute_proposal', {
    // The SDK handles the `executor` argument implicitly if using `require_auth()`
    proposal_id: proposalId,
  });

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

  // TODO: Replace with actual Soroban contract invocation
  const transaction = new TransactionBuilder(executorAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      new Contract(getSpeciesVotingContract(network)).call(
        'execute_proposal'
      )
      Operation.invokeHostFunction({
        func: {
          args: [],
          auth: [],
        },
        hostFunction: {
          type: 'invokeContract',
          contractId: getSpeciesVotingContract(network),
          functionName: 'execute_proposal',
        },
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: new Address(getSpeciesVotingContract(network)).toScAddress(),
            functionName: 'execute_proposal',
            args: [],
          })
        ),
        auth: [],
      })
    )
    .setTimeout(300)
    .build();
  // Prepare the read-only contract call
  const operation = contract.call('get_proposal', { proposal_id: proposalId });

  // Use `server.call()` for read-only invocations. This is a simulation.
  const result = await server.call(operation);

  if (result.status !== 'SUCCESS' || !result.returnValue) {
    // You might want to inspect result.errorResult.xdr for a contract-level error
    throw new Error(`Failed to fetch proposal #${proposalId}.`);
  }

  // The return value from the contract is in XDR format; it must be converted to a native JS type.
  const parsedResult = scValToNative(result.returnValue);

  // IMPORTANT: The `parsedResult` will be a raw object or map from the contract.
  // You must manually map its properties to your `ProposalRecord` interface,
  // ensuring types like `bigint` are handled correctly.
  // For example: `votes_for: BigInt(parsedResult.votes_for)`
  console.info('Raw proposal data from contract:', parsedResult);

  return parsedResult as ProposalRecord; // Replace with proper mapping
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calculate the percentage of votes in favor.
 */
export function calculateVotePercentage(votesFor: bigint, votesAgainst: bigint): number {
  const total = votesFor + votesAgainst;
  if (total === 0n) return 0;

  // Use bigint arithmetic to avoid precision loss before converting to a number.
  // Multiply by 10000 to get two decimal places of precision.
  return Number((votesFor * 10000n) / total) / 100;
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
  

  if (remaining <= 0) return 'Voting ended';

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} remaining`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
  return 'Less than 1 hour remaining';
}
