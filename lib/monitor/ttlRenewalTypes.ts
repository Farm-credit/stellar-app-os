export interface TtlRenewalConfig {
  rpcUrl: string;
  networkPassphrase: string;
  signerSecret: string;
  contractIds: string[];
  thresholdLedgers: number;
  extendToLedgers: number;
  pollIntervalMs: number;
}

export type ContractTtlStatus = 'healthy' | 'renewed' | 'error';

export interface ContractTtlResult {
  contractId: string;
  status: ContractTtlStatus;
  currentLedger: number;
  liveUntilLedgerSeq?: number;
  remainingLedgers?: number;
  newLiveUntilLedgerSeq?: number;
  transactionHash?: string;
  /** Safe, human-readable failure reason. Never includes secrets or raw SDK errors. */
  error?: string;
}

export interface TtlRenewalSummary {
  checkedAt: string;
  results: ContractTtlResult[];
}
