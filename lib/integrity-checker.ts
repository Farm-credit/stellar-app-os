import { getPool } from '@/lib/db/client';
import type { TreeRow } from '@/lib/db/schema';
import sgMail from '@sendgrid/mail';

interface IntegrityCheckResult {
  totalVerifiedTrees: number;
  matchingOnChainEvents: number;
  discrepancies: Discrepancy[];
  reportTimestamp: string;
}

interface Discrepancy {
  type: 'missing_event' | 'extra_tree' | 'status_mismatch';
  treeId?: number;
  eventId?: string;
  details: string;
}

export async function runIntegrityCheck(): Promise<IntegrityCheckResult> {
  console.info('[integrity-checker] Starting integrity check...');
  const pool = getPool();

  const result: IntegrityCheckResult = {
    totalVerifiedTrees: 0,
    matchingOnChainEvents: 0,
    discrepancies: [],
    reportTimestamp: new Date().toISOString(),
  };

  try {
    // Step 1: Get all verified trees from DB
    const treeResult = await pool.query<TreeRow>('SELECT * FROM trees WHERE status = $1;', [
      'verified',
    ]);
    result.totalVerifiedTrees = treeResult.rows.length;
    console.info(`[integrity-checker] Found ${result.totalVerifiedTrees} verified trees in DB`);

    // Step 2: Get all relevant contract events from DB
    const eventResult = await pool.query(
      `SELECT * FROM contract_events WHERE event_type = $1 ORDER BY ledger_closed_at DESC;`,
      ['TreeMinted']
    );
    const dbEvents = eventResult.rows;

    // Step 3: Compare and find discrepancies
    // Check for trees without corresponding events
    for (const tree of treeResult.rows) {
      const hasMatchingEvent = dbEvents.some((e) => e.contract_id === tree.contract_address);
      if (!hasMatchingEvent) {
        result.discrepancies.push({
          type: 'missing_event',
          treeId: tree.id,
          details: `Tree ${tree.id} (contract: ${tree.contract_address}) is marked as verified but has no corresponding TreeMinted event.`,
        });
      } else {
        result.matchingOnChainEvents++;
      }
    }

    // Check for events without corresponding trees (optional)
    for (const event of dbEvents) {
      const hasMatchingTree = treeResult.rows.some((t) => t.contract_address === event.contract_id);
      if (!hasMatchingTree) {
        result.discrepancies.push({
          type: 'extra_tree',
          eventId: event.id,
          details: `Event ${event.id} (contract: ${event.contract_id}) exists but no verified tree found for this contract.`,
        });
      }
    }

    console.info(
      `[integrity-checker] Check complete: ${result.discrepancies.length} discrepancies found`
    );
  } catch (error) {
    console.error('[integrity-checker] Error during integrity check:', error);
    throw error;
  }

  return result;
}

export function exportIntegrityReport(result: IntegrityCheckResult): string {
  const report = `
=== HARVESTA INTEGRITY REPORT ===
Generated: ${result.reportTimestamp}
Total Verified Trees: ${result.totalVerifiedTrees}
Matching On-Chain Events: ${result.matchingOnChainEvents}
Discrepancies Found: ${result.discrepancies.length}

--- DISCREPANCIES ---
${
  result.discrepancies.length === 0
    ? 'No discrepancies found. System is in sync.'
    : result.discrepancies
        .map(
          (d) => `
[${d.type.toUpperCase()}]
  Tree ID: ${d.treeId ?? 'N/A'}
  Event ID: ${d.eventId ?? 'N/A'}
  Details: ${d.details}
`
        )
        .join('\n')
}
=== END OF REPORT ===
  `.trim();

  console.info('[integrity-checker] Generated report');
  return report;
}

export async function sendAdminAlert(result: IntegrityCheckResult): Promise<void> {
  if (result.discrepancies.length === 0) {
    console.info('[integrity-checker] No discrepancies, no alert sent');
    return;
  }

  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  if (!adminEmail) {
    console.warn('[integrity-checker] ADMIN_ALERT_EMAIL not set, skipping alert');
    return;
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('[integrity-checker] SENDGRID_API_KEY not set, skipping alert');
    return;
  }
  sgMail.setApiKey(apiKey);

  const FROM = process.env.SENDGRID_FROM_EMAIL ?? 'no-reply@harvesta.app';

  try {
    const report = exportIntegrityReport(result);
    await sgMail.send({
      to: adminEmail,
      from: FROM,
      subject: `[ALERT] Integrity Check Discrepancies Found (${result.discrepancies.length})`,
      text: report,
      html: `<pre>${report}</pre>`,
    });
    console.info('[integrity-checker] Admin alert sent successfully');
  } catch (error) {
    console.error('[integrity-checker] Failed to send admin alert:', error);
  }
}

// Check if this file is being run directly
const isMain = require.main === module;
if (isMain) {
  (async () => {
    try {
      const result = await runIntegrityCheck();
      const report = exportIntegrityReport(result);
      console.log(report);
      await sendAdminAlert(result);
      process.exit(0);
    } catch (error) {
      console.error('[integrity-checker] Fatal error:', error);
      process.exit(1);
    }
  })();
}
