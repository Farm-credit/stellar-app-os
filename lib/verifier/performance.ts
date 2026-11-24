import { scValToNative, xdr } from '@stellar/stellar-sdk';
import type { Pool } from 'pg';

interface VerifierMetricRow {
  verifier_address: string;
  total_audits: string | number;
  approvals: string | number;
  accurate_approvals: string | number;
  accuracy_sample_size: string | number;
  disputed_audits: string | number;
  average_turnaround_seconds: string | number | null;
}

interface ContractEventRow {
  id: string;
  ledger_closed_at: Date | string;
  topics_xdr: string[];
  value_xdr: string | null;
}

export interface VerifierPerformance {
  verifierAddress: string;
  totalAudits: number;
  approvals: number;
  accurateApprovals: number;
  accuracySampleSize: number;
  approvalAccuracyPercent: number | null;
  disputedAudits: number;
  disputeRatePercent: number | null;
  averageTurnaroundSeconds: number | null;
}

export interface VerifierSlashEvent {
  id: string;
  verifierAddress: string;
  amount: string;
  occurredAt: string;
}

export interface VerifierPerformanceReport {
  verifiers: VerifierPerformance[];
  slashHistory: VerifierSlashEvent[];
  slashHistoryConfigured: boolean;
}

function asNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
}

function toNative(encoded: string): unknown {
  return scValToNative(xdr.ScVal.fromXDR(encoded, 'base64'));
}

function toText(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    return value.toString();
  }
  return null;
}

function parseSlashEvent(row: ContractEventRow): VerifierSlashEvent | null {
  if (row.topics_xdr.length < 2 || !row.value_xdr) return null;

  try {
    if (toText(toNative(row.topics_xdr[0])) !== 'slashed') return null;
    const verifierAddress = toText(toNative(row.topics_xdr[1]));
    const amount = toText(toNative(row.value_xdr));
    if (!verifierAddress || !amount) return null;

    return {
      id: row.id,
      verifierAddress,
      amount,
      occurredAt:
        row.ledger_closed_at instanceof Date
          ? row.ledger_closed_at.toISOString()
          : new Date(row.ledger_closed_at).toISOString(),
    };
  } catch (error) {
    console.warn(`[verifier-performance] Could not decode slash event ${row.id}:`, error);
    return null;
  }
}

export async function getVerifierPerformanceReport(
  pool: Pool,
  stakingContractId: string | undefined
): Promise<VerifierPerformanceReport> {
  const metrics = await pool.query<VerifierMetricRow>(
    `SELECT verifier_address,
            COUNT(*)::bigint AS total_audits,
            COUNT(*) FILTER (WHERE decision = 'approved')::bigint AS approvals,
            COUNT(*) FILTER (
              WHERE decision = 'approved'
                AND dispute_outcome = 'upheld'
            )::bigint AS accurate_approvals,
            COUNT(*) FILTER (WHERE decision = 'approved')::bigint AS accuracy_sample_size,
            COUNT(*) FILTER (WHERE disputed_at IS NOT NULL)::bigint AS disputed_audits,
            AVG(EXTRACT(EPOCH FROM (completed_at - assigned_at))) AS average_turnaround_seconds
       FROM verifier_audits
      GROUP BY verifier_address
      ORDER BY verifier_address`
  );

  const verifiers = metrics.rows.map((row) => {
    const totalAudits = asNumber(row.total_audits) ?? 0;
    const approvals = asNumber(row.approvals) ?? 0;
    const accurateApprovals = asNumber(row.accurate_approvals) ?? 0;
    const accuracySampleSize = asNumber(row.accuracy_sample_size) ?? 0;
    const disputedAudits = asNumber(row.disputed_audits) ?? 0;
    const averageTurnaroundSeconds = asNumber(row.average_turnaround_seconds);

    return {
      verifierAddress: row.verifier_address,
      totalAudits,
      approvals,
      accurateApprovals,
      accuracySampleSize,
      approvalAccuracyPercent:
        accuracySampleSize > 0 ? (accurateApprovals / accuracySampleSize) * 100 : null,
      disputedAudits,
      disputeRatePercent: totalAudits > 0 ? (disputedAudits / totalAudits) * 100 : null,
      averageTurnaroundSeconds,
    };
  });

  if (!stakingContractId) {
    return { verifiers, slashHistory: [], slashHistoryConfigured: false };
  }

  const events = await pool.query<ContractEventRow>(
    `SELECT id, ledger_closed_at, topics_xdr, value_xdr
       FROM contract_events
      WHERE contract_id = $1
        AND cardinality(topics_xdr) >= 2
        AND value_xdr IS NOT NULL
      ORDER BY ledger DESC
      LIMIT 1000`,
    [stakingContractId]
  );

  return {
    verifiers,
    slashHistory: events.rows
      .map(parseSlashEvent)
      .filter((event): event is VerifierSlashEvent => event !== null),
    slashHistoryConfigured: true,
  };
}
