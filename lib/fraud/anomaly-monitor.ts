/**
 * Fraud detection / anomaly monitoring — Issue #1381
 *
 * Rule-based scoring that flags double-selling, fake farmers, project
 * inflation, and manipulated metrics for investigation.
 */

export type FraudSignalType =
  | 'double_selling'
  | 'fake_farmer'
  | 'project_inflation'
  | 'manipulated_metrics';

export type FraudSeverity = 'low' | 'medium' | 'high';

export type FraudEvent = {
  id?: string;
  farmerId?: string;
  projectId?: string;
  creditId?: string;
  buyerId?: string;
  claimedQuantity?: number;
  verifiedQuantity?: number;
  kycVerified?: boolean;
  accountAgeDays?: number;
  plotCount?: number;
  priorSales?: number;
  metricDeltaPct?: number;
};

export type FraudFlag = {
  eventId: string;
  type: FraudSignalType;
  severity: FraudSeverity;
  score: number;
  reason: string;
  status: 'flagged_for_investigation';
};

export type FraudScanResult = {
  scanned: number;
  flagged: number;
  flags: FraudFlag[];
};

function severityFor(score: number): FraudSeverity {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function flag(
  eventId: string,
  type: FraudSignalType,
  score: number,
  reason: string
): FraudFlag {
  return {
    eventId,
    type,
    severity: severityFor(score),
    score,
    reason,
    status: 'flagged_for_investigation',
  };
}

export function scanFraudEvent(event: FraudEvent, index = 0): FraudFlag[] {
  const eventId = event.id || `evt-${index + 1}`;
  const flags: FraudFlag[] = [];
  const claimed = event.claimedQuantity ?? 0;
  const verified = event.verifiedQuantity ?? 0;

  if ((event.priorSales ?? 0) > 0 && event.creditId) {
    flags.push(
      flag(
        eventId,
        'double_selling',
        Math.min(100, 60 + event.priorSales! * 15),
        `Credit ${event.creditId} already has ${event.priorSales} recorded sale(s).`
      )
    );
  }

  const newAccount = (event.accountAgeDays ?? 365) < 14;
  const noKyc = event.kycVerified === false;
  const noPlots = (event.plotCount ?? 1) === 0;
  if (noKyc || newAccount || noPlots) {
    const score = (noKyc ? 40 : 0) + (newAccount ? 30 : 0) + (noPlots ? 30 : 0);
    flags.push(
      flag(
        eventId,
        'fake_farmer',
        score,
        `Farmer ${event.farmerId ?? 'unknown'} failed identity checks (KYC/plots/account age).`
      )
    );
  }

  if (claimed > 0 && verified >= 0 && claimed > verified * 1.25) {
    const inflation = Math.round(((claimed - verified) / Math.max(verified, 1)) * 100);
    flags.push(
      flag(
        eventId,
        'project_inflation',
        Math.min(100, 50 + inflation),
        `Project ${event.projectId ?? 'unknown'} claims ${claimed} against ${verified} verified units (${inflation}% over).`
      )
    );
  }

  if (Math.abs(event.metricDeltaPct ?? 0) >= 40) {
    flags.push(
      flag(
        eventId,
        'manipulated_metrics',
        Math.min(100, 45 + Math.abs(event.metricDeltaPct!)),
        `Metric moved ${event.metricDeltaPct}% without a matching verification event.`
      )
    );
  }

  return flags;
}

export function scanFraudEvents(events: FraudEvent[]): FraudScanResult {
  const flags = events.flatMap((event, index) => scanFraudEvent(event, index));
  return {
    scanned: events.length,
    flagged: new Set(flags.map((item) => item.eventId)).size,
    flags,
  };
}
