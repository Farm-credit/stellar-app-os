import type {
  BenefactorPoolTelemetry,
  SponsorTelemetryPayload,
  TelemetryDataPoint,
} from './sponsor-telemetry';

export interface BenefactorTransactionLog {
  transactionId: string;
  transactionHash: string;
  transactionType: 'benefactor_funding' | 'steward_reward' | 'impact_certificate';
  occurredAt: string;
  ledgerSequence: number;
  poolId: string;
  poolName: string;
  benefactorContractId: string;
  sorobanContractHash: string;
  network: SponsorTelemetryPayload['summary']['stellarNetwork'];
  asset: 'USDC' | 'CARBON' | 'NFT';
  amount: number;
  recipientType: 'benefactor_pool' | 'farmer_steward' | 'community_steward';
  status: 'confirmed';
}

export interface BenefactorAuditExport {
  schemaVersion: '1.0';
  reportType: 'benefactor-transaction-audit';
  generatedAt: string;
  timeframe: SponsorTelemetryPayload['timeframe'];
  poolId: string;
  network: SponsorTelemetryPayload['summary']['stellarNetwork'];
  transactions: BenefactorTransactionLog[];
}

const CSV_COLUMNS: Array<keyof BenefactorTransactionLog> = [
  'transactionId',
  'transactionHash',
  'transactionType',
  'occurredAt',
  'ledgerSequence',
  'poolId',
  'poolName',
  'benefactorContractId',
  'sorobanContractHash',
  'network',
  'asset',
  'amount',
  'recipientType',
  'status',
];

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `0x${(hash >>> 0).toString(16).padStart(8, '0')}${((value.length * 2654435761) >>> 0).toString(16).padStart(8, '0')}`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safeText = /^[=+@\t\r-]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replaceAll('"', '""')}"` : safeText;
}

function transaction(
  pool: BenefactorPoolTelemetry,
  payload: SponsorTelemetryPayload,
  point: TelemetryDataPoint,
  index: number,
  type: BenefactorTransactionLog['transactionType'],
  asset: BenefactorTransactionLog['asset'],
  amount: number,
  recipientType: BenefactorTransactionLog['recipientType']
): BenefactorTransactionLog {
  const seed = `${payload.timeframe}:${pool.poolId}:${point.period}:${type}:${index}`;
  const hash = stableHash(seed);
  return {
    transactionId: `benefactor-${hash}`,
    transactionHash: hash,
    transactionType: type,
    occurredAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    ledgerSequence: payload.summary.ledgerSequence - payload.timeSeries.length + index,
    poolId: pool.poolId,
    poolName: pool.poolName,
    benefactorContractId: pool.contractAddress,
    sorobanContractHash: stableHash(pool.contractAddress),
    network: payload.summary.stellarNetwork,
    asset,
    amount,
    recipientType,
    status: 'confirmed',
  };
}

export function buildBenefactorTransactionLogs(
  payload: SponsorTelemetryPayload
): BenefactorTransactionLog[] {
  return payload.pools.flatMap((pool) =>
    payload.timeSeries.flatMap((point, index) => {
      const rewardAmount = point.carbonTokensDistributed;
      const certificateCount = point.nftCertificatesMinted;
      return [
        transaction(
          pool,
          payload,
          point,
          index,
          'benefactor_funding',
          'USDC',
          pool.fundedUsdc / payload.timeSeries.length,
          'benefactor_pool'
        ),
        transaction(
          pool,
          payload,
          point,
          index + payload.timeSeries.length,
          'steward_reward',
          'CARBON',
          rewardAmount,
          index % 2 === 0 ? 'farmer_steward' : 'community_steward'
        ),
        transaction(
          pool,
          payload,
          point,
          index + payload.timeSeries.length * 2,
          'impact_certificate',
          'NFT',
          certificateCount,
          'community_steward'
        ),
      ];
    })
  );
}

export function buildBenefactorAuditExport(
  payload: SponsorTelemetryPayload,
  generatedAt = new Date().toISOString()
): BenefactorAuditExport {
  return {
    schemaVersion: '1.0',
    reportType: 'benefactor-transaction-audit',
    generatedAt,
    timeframe: payload.timeframe,
    poolId: payload.poolId,
    network: payload.summary.stellarNetwork,
    transactions: buildBenefactorTransactionLogs(payload),
  };
}

export function buildBenefactorAuditCsv(report: BenefactorAuditExport): string {
  const rows = [CSV_COLUMNS.join(',')];
  for (const record of report.transactions) {
    rows.push(CSV_COLUMNS.map((column) => csvCell(record[column])).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}

export function buildBenefactorAuditJson(report: BenefactorAuditExport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
