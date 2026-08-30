import {
  Contract,
  Keypair,
  Operation,
  SorobanDataBuilder,
  rpc,
  TransactionBuilder,
  type xdr,
} from '@stellar/stellar-sdk';
import { networkConfig } from '@/lib/config/network';
import logger from '@/lib/logger';
import type { ContractTtlResult, TtlRenewalConfig, TtlRenewalSummary } from './ttlRenewalTypes';

const DEFAULT_THRESHOLD_LEDGERS = 17_280; // ~1 day at 5s/ledger
const DEFAULT_EXTEND_TO_LEDGERS = 518_400; // ~30 days at 5s/ledger
const DEFAULT_POLL_INTERVAL_MS = 3_600_000; // 1 hour
const RENEWAL_FEE_STROOPS = '1000000'; // 0.1 XLM max fee, matches lib/stellar/locationProof.ts
const CONFIRM_POLL_ATTEMPTS = 30;
const CONFIRM_POLL_INTERVAL_MS = 2_000;

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function getConfig(): TtlRenewalConfig {
  const contractIds = (process.env.TTL_RENEWAL_CONTRACT_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const thresholdLedgers = Number(process.env.TTL_RENEWAL_THRESHOLD_LEDGERS);
  const extendToLedgers = Number(process.env.TTL_RENEWAL_EXTEND_TO_LEDGERS);
  const pollIntervalMs = Number(process.env.TTL_RENEWAL_POLL_INTERVAL_MS);

  return {
    rpcUrl: networkConfig.sorobanRpcUrl,
    networkPassphrase: networkConfig.networkPassphrase,
    signerSecret: process.env.TTL_RENEWAL_SIGNER_SECRET ?? '',
    contractIds,
    thresholdLedgers:
      Number.isInteger(thresholdLedgers) && thresholdLedgers > 0
        ? thresholdLedgers
        : DEFAULT_THRESHOLD_LEDGERS,
    extendToLedgers:
      Number.isInteger(extendToLedgers) && extendToLedgers > 0
        ? extendToLedgers
        : DEFAULT_EXTEND_TO_LEDGERS,
    pollIntervalMs:
      Number.isInteger(pollIntervalMs) && pollIntervalMs > 0
        ? pollIntervalMs
        : DEFAULT_POLL_INTERVAL_MS,
  };
}

async function pollForConfirmation(server: rpc.Server, hash: string): Promise<boolean> {
  for (let attempt = 0; attempt < CONFIRM_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_INTERVAL_MS));
    const status = await server.getTransaction(hash);
    if (status.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return true;
    }
    if (status.status === rpc.Api.GetTransactionStatus.FAILED) {
      return false;
    }
  }
  return false;
}

async function renewContractTtl(
  contractId: string,
  ledgerKey: xdr.LedgerKey,
  config: TtlRenewalConfig,
  server: rpc.Server,
  signer: Keypair
): Promise<{ transactionHash: string }> {
  const account = await server.getAccount(signer.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: RENEWAL_FEE_STROOPS,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(Operation.extendFootprintTtl({ extendTo: config.extendToLedgers }))
    .setSorobanData(new SorobanDataBuilder().setReadOnly([ledgerKey]).build())
    .setTimeout(300)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Soroban simulation failed: ${simResult.error}`);
  }

  const assembled = rpc.assembleTransaction(tx, simResult).build();
  assembled.sign(signer);

  const sendResult = await server.sendTransaction(assembled);
  if (sendResult.status === 'ERROR') {
    throw new Error('Transaction submission was rejected by the network');
  }

  const confirmed = await pollForConfirmation(server, sendResult.hash);
  if (!confirmed) {
    throw new Error(`Transaction not confirmed: ${sendResult.hash}`);
  }

  return { transactionHash: sendResult.hash };
}

/**
 * Checks a single contract instance's storage TTL and, if it has fallen
 * below `config.thresholdLedgers`, submits an ExtendFootprintTTL operation
 * to bump it back out to `config.extendToLedgers`.
 *
 * Never throws — all failures are captured in the returned result's
 * `status: 'error'` / `error` fields so one contract's failure can't stop
 * the rest of the batch.
 */
export async function checkAndRenewContractTtl(
  contractId: string,
  config: TtlRenewalConfig,
  server: rpc.Server,
  signer: Keypair
): Promise<ContractTtlResult> {
  let ledgerKey: xdr.LedgerKey;
  try {
    ledgerKey = new Contract(contractId).getFootprint();
  } catch (error) {
    logger.error('[ttl-renewal] invalid contract id', {
      contractId,
      error: safeErrorMessage(error),
    });
    return { contractId, status: 'error', currentLedger: 0, error: safeErrorMessage(error) };
  }

  let currentLedger: number;
  let liveUntilLedgerSeq: number | undefined;
  try {
    const entriesResponse = await server.getLedgerEntries(ledgerKey);
    currentLedger = entriesResponse.latestLedger;
    liveUntilLedgerSeq = entriesResponse.entries[0]?.liveUntilLedgerSeq;
  } catch (error) {
    logger.error('[ttl-renewal] getLedgerEntries failed', {
      contractId,
      error: safeErrorMessage(error),
    });
    return { contractId, status: 'error', currentLedger: 0, error: safeErrorMessage(error) };
  }

  if (liveUntilLedgerSeq === undefined) {
    const error = 'Contract instance ledger entry not found (not deployed or already archived)';
    logger.error('[ttl-renewal] entry missing', { contractId });
    return { contractId, status: 'error', currentLedger, error };
  }

  const remainingLedgers = liveUntilLedgerSeq - currentLedger;

  if (remainingLedgers >= config.thresholdLedgers) {
    logger.info('[ttl-renewal] TTL healthy', { contractId, remainingLedgers });
    return { contractId, status: 'healthy', currentLedger, liveUntilLedgerSeq, remainingLedgers };
  }

  logger.warn('[ttl-renewal] TTL below threshold, renewing', {
    contractId,
    remainingLedgers,
    thresholdLedgers: config.thresholdLedgers,
  });

  try {
    const { transactionHash } = await renewContractTtl(
      contractId,
      ledgerKey,
      config,
      server,
      signer
    );
    logger.info('[ttl-renewal] TTL renewed', { contractId, transactionHash });
    return {
      contractId,
      status: 'renewed',
      currentLedger,
      liveUntilLedgerSeq,
      remainingLedgers,
      newLiveUntilLedgerSeq: currentLedger + config.extendToLedgers,
      transactionHash,
    };
  } catch (error) {
    logger.error('[ttl-renewal] renewal failed', { contractId, error: safeErrorMessage(error) });
    return {
      contractId,
      status: 'error',
      currentLedger,
      liveUntilLedgerSeq,
      remainingLedgers,
      error: safeErrorMessage(error),
    };
  }
}

/**
 * Runs a TTL check (and renewal, where due) across every contract in
 * TTL_RENEWAL_CONTRACT_IDS. Contracts are processed sequentially because
 * renewals share a single signer account and Stellar transactions from one
 * account must be submitted in sequence-number order.
 */
export async function runTtlRenewalCheck(
  configOverride?: Partial<TtlRenewalConfig>,
  server?: rpc.Server
): Promise<TtlRenewalSummary> {
  const config: TtlRenewalConfig = { ...getConfig(), ...configOverride };
  const checkedAt = new Date().toISOString();

  if (!config.signerSecret) {
    logger.error('[ttl-renewal] TTL_RENEWAL_SIGNER_SECRET is not set; skipping TTL renewal check');
    return { checkedAt, results: [] };
  }

  if (config.contractIds.length === 0) {
    logger.warn('[ttl-renewal] TTL_RENEWAL_CONTRACT_IDS is empty; nothing to check');
    return { checkedAt, results: [] };
  }

  let signer: Keypair;
  try {
    signer = Keypair.fromSecret(config.signerSecret);
  } catch {
    logger.error('[ttl-renewal] TTL_RENEWAL_SIGNER_SECRET is not a valid Stellar secret key');
    return { checkedAt, results: [] };
  }

  const rpcServer = server ?? new rpc.Server(config.rpcUrl, { allowHttp: false });

  const results: ContractTtlResult[] = [];
  for (const contractId of config.contractIds) {
    results.push(await checkAndRenewContractTtl(contractId, config, rpcServer, signer));
  }

  return { checkedAt, results };
}
