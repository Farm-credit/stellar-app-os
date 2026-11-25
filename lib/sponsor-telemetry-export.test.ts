import { describe, expect, it } from 'vitest';
import { buildSponsorTelemetry } from './sponsor-telemetry';
import {
  buildBenefactorAuditCsv,
  buildBenefactorAuditExport,
  buildBenefactorTransactionLogs,
} from './sponsor-telemetry-export';

describe('benefactor telemetry exports', () => {
  const payload = buildSponsorTelemetry('30d', 'pool-rift-valley');

  it('builds a complete transaction log for every pool period', () => {
    const transactions = buildBenefactorTransactionLogs(payload);

    expect(transactions).toHaveLength(payload.pools.length * payload.timeSeries.length * 3);
    expect(transactions[0]).toMatchObject({
      poolId: 'pool-rift-valley',
      benefactorContractId: payload.pools[0].contractAddress,
      network: payload.summary.stellarNetwork,
      status: 'confirmed',
    });
    expect(transactions.every((record) => record.transactionHash.length > 0)).toBe(true);
    expect(transactions.every((record) => record.sorobanContractHash.length > 0)).toBe(true);
    expect(new Set(transactions.map((record) => record.transactionId)).size).toBe(
      transactions.length
    );
  });

  it('includes report metadata and transaction records in JSON exports', () => {
    const report = buildBenefactorAuditExport(payload, '2026-11-25T00:00:00.000Z');
    const parsed = JSON.parse(JSON.stringify(report)) as typeof report;

    expect(parsed).toMatchObject({
      schemaVersion: '1.0',
      reportType: 'benefactor-transaction-audit',
      timeframe: '30d',
      poolId: 'pool-rift-valley',
      generatedAt: '2026-11-25T00:00:00.000Z',
    });
    expect(parsed.transactions).toHaveLength(12);
  });

  it('quotes CSV cells and neutralises spreadsheet formulas', () => {
    const report = buildBenefactorAuditExport(payload, '2026-11-25T00:00:00.000Z');
    report.transactions[0].poolName = '=HYPERLINK("https://example.com","open")';

    const csv = buildBenefactorAuditCsv(report);

    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"",""open"")"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
