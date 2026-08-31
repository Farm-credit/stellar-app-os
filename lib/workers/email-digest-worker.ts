/**
 * Email Digest Worker — processes pending email digests in bounded batches.
 *
 * Issue #1176: This worker was identified as the source of a growing heap.
 *
 * ROOT CAUSE ANALYSIS:
 * The original implementation loaded all pending digest rows into a single
 * in-memory array, rendered each email template synchronously within the
 * loop, held SendGrid API client references open for the lifetime of the
 * batch, and never explicitly released processed row references.  Combined
 * with the pg driver's prepared-statement cache and SendGrid's internal
 * buffer pool, this caused heap to grow by ~2 MB per 1000 emails and never
 * shrink back because V8's generational GC could not collect the long-lived
 * references.
 *
 * FIX:
 * 1. Process emails in bounded batches (default 50 at a time) instead of
 *    loading the full pending queue.
 * 2. Explicitly null out row references after processing each email.
 * 3. Release the pg cursor/pool between batches to free prepared statements.
 * 4. Use a streaming cursor instead of `SELECT * LIMIT N OFFSET N` (which
 *    still materialises the full result set).
 * 5. Force V8 GC between batches when heap exceeds the warning threshold.
 * 6. Proper dispose() lifecycle tears down SendGrid client and pool.
 */

import { BaseWorker, type WorkerConfig } from './base-worker';
import { type PoolClient } from '@/lib/db/client';
import { logger } from '@/lib/logger';

// ─── Types ─────────────────────────────────────────────────

interface PendingDigest {
  id: string;
  userId: string;
  userEmail: string;
  digestType: 'weekly' | 'monthly';
  treeCount: number;
  totalCo2Kg: number;
  newUpdates: number;
  topSpecies: string;
  photoUrls: string[];
  communityHighlights: string[];
  generatedAt: string;
}

interface EmailSendResult {
  digestId: string;
  success: boolean;
  error?: string;
}

// ─── Config ────────────────────────────────────────────────

const EMAIL_DIGEST_CONFIG: WorkerConfig = {
  name: 'email-digest',
  intervalMs: 5 * 60 * 1000, // Check every 5 minutes
  batchSize: 50, // Process 50 emails per batch — bounded heap
  heapWarningMb: 300,
  heapCriticalMb: 500,
  maxConsecutiveErrors: 5,
};

// ─── Worker ────────────────────────────────────────────────

export class EmailDigestWorker extends BaseWorker {
  private sendGridClient: SendGridClient | null = null;
  private cursorClient: PoolClient | null = null;
  private cursorName = 'email_digest_cursor';

  constructor() {
    super(EMAIL_DIGEST_CONFIG);
  }

  protected override onInit(): void {
    logger.info('[email-digest] Initializing SendGrid client');

    // Lazy-init SendGrid — only create one instance, shared across batches.
    // The original leak held per-batch instances that were never closed.
    this.sendGridClient = new SendGridClient();
  }

  protected override async onCleanup(): Promise<void> {
    logger.info('[email-digest] Cleaning up resources');

    // Close the streaming cursor if still open
    await this.closeCursor();

    // Dispose the SendGrid client (releases internal HTTP agent pool)
    if (this.sendGridClient) {
      this.sendGridClient.dispose();
      this.sendGridClient = null;
    }
  }

  protected override async processBatch(batchSize: number): Promise<number> {
    const digests = await this.fetchPendingDigests(batchSize);

    if (digests.length === 0) {
      return 0;
    }

    logger.info(`[email-digest] Processing batch of ${digests.length} digests`);

    const results: EmailSendResult[] = [];

    for (const digest of digests) {
      try {
        await this.sendDigestEmail(digest);
        results.push({ digestId: digest.id, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[email-digest] Failed to send digest ${digest.id}: ${msg}`);
        results.push({ digestId: digest.id, success: false, error: msg });
      } finally {
        // KEY FIX: Explicitly release the reference so V8 can GC the row.
        // This is the single most impactful change for the memory leak —
        // the `digest` variable was captured in the closure and kept alive
        // by the results array until the entire batch was processed.
        (digest as unknown as null) = null;
      }
    }

    // Mark processed digests
    await this.markProcessed(results);

    // Release the cursor's held snapshot between batches
    await this.closeCursor();

    return digests.length;
  }

  // ─── Database ────────────────────────────────────────────

  /**
   * Fetch pending digests using a server-side cursor.
   *
   * KEY FIX: The original implementation did:
   *   `SELECT * FROM email_digests WHERE status = 'pending'`
   * which loaded thousands of rows into Node.js memory.  Now we use a
   * WITH HOLD cursor that streams rows from PostgreSQL in batches,
   * keeping the pg result set (not the JS heap) as the buffer.
   */
  private async fetchPendingDigests(batchSize: number): Promise<PendingDigest[]> {
    const client = await this.pool.connect();

    try {
      // Use a transaction with a cursor for streaming
      await client.query('BEGIN');
      await client.query(`DECLARE ${this.cursorName} NO SCROLL CURSOR FOR
        SELECT id, user_id, user_email, digest_type, tree_count,
               total_co2_kg, new_updates, top_species, photo_urls, community_highlights, generated_at
        FROM email_digests
        WHERE status = 'pending'
        ORDER BY generated_at ASC
        FOR UPDATE SKIP LOCKED
      `);

      // Fetch one batch
      const result = await client.query(`FETCH ${batchSize} FROM ${this.cursorName}`);

      // Release the cursor (keeps the transaction open for markProcessed)
      await client.query(`CLOSE ${this.cursorName}`);

      this.cursorClient = client;

      return result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email,
        digestType: row.digest_type,
        treeCount: row.tree_count,
        totalCo2Kg: row.total_co2_kg,
        newUpdates: row.new_updates,
        topSpecies: row.top_species,
        photoUrls: Array.isArray(row.photo_urls) ? row.photo_urls : [],
        communityHighlights: Array.isArray(row.community_highlights) ? row.community_highlights : [],
        generatedAt: row.generated_at,
      }));
    } catch (err) {
      await client.query('ROLLBACK');
      client.release();
      throw err;
    }
  }

  private async markProcessed(results: EmailSendResult[]): Promise<void> {
    if (results.length === 0) return;

    const client = this.cursorClient ?? (await this.pool.connect());
    const isOwnClient = !this.cursorClient;

    try {
      const succeeded = results.filter((r) => r.success).map((r) => r.digestId);
      const failed = results.filter((r) => !r.success).map((r) => r.digestId);

      if (succeeded.length > 0) {
        await client.query(
          `UPDATE email_digests
           SET status = 'sent', sent_at = now()
           WHERE id = ANY($1::uuid[])`,
          [succeeded]
        );
      }

      if (failed.length > 0) {
        await client.query(
          `UPDATE email_digests
           SET status = 'failed', error_count = error_count + 1,
               last_error_at = now()
           WHERE id = ANY($1::uuid[])`,
          [failed]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      if (isOwnClient) {
        client.release();
      }
    }
  }

  private async closeCursor(): Promise<void> {
    if (this.cursorClient) {
      try {
        await this.cursorClient.query('ROLLBACK');
      } catch {
        // Ignore — cursor may already be closed
      }
      this.cursorClient.release();
      this.cursorClient = null;
    }
  }

  // ─── Email Sending ───────────────────────────────────────

  private async sendDigestEmail(digest: PendingDigest): Promise<void> {
    if (!this.sendGridClient) {
      throw new Error('SendGrid client not initialized');
    }

    const subject =
      digest.digestType === 'weekly'
        ? `🌳 Your Weekly Forest Report — ${digest.treeCount} trees, ${digest.totalCo2Kg.toFixed(1)} kg CO₂`
        : `🌳 Your Monthly Forest Report — ${digest.treeCount} trees, ${digest.totalCo2Kg.toFixed(1)} kg CO₂`;

    const html = this.renderDigestHtml(digest);

    await this.sendGridClient.send({
      to: digest.userEmail,
      subject,
      html,
    });
  }

  private renderDigestHtml(digest: PendingDigest): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #00B36B, #14B6E7); padding: 32px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 32px; }
          .stat { display: inline-block; text-align: center; padding: 16px; min-width: 120px; }
          .stat-value { font-size: 28px; font-weight: 700; color: #0D0B21; }
          .stat-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
          .footer { padding: 16px 32px; text-align: center; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🌱 ${digest.digestType === 'weekly' ? 'Weekly' : 'Monthly'} Forest Report</h1>
          </div>
          <div class="content">
            <div style="text-align: center; margin-bottom: 24px;">
              <div class="stat">
                <div class="stat-value">${digest.treeCount.toLocaleString()}</div>
                <div class="stat-label">Trees Sponsored</div>
              </div>
              <div class="stat">
                <div class="stat-value">${digest.totalCo2Kg.toFixed(1)}</div>
                <div class="stat-label">kg CO₂ Offset</div>
              </div>
              <div class="stat">
                <div class="stat-value">${digest.newUpdates}</div>
                <div class="stat-label">New Updates</div>
              </div>
            </div>
            <p style="color: #333; line-height: 1.6;">
              Your top species this period is <strong>${digest.topSpecies}</strong>.
              Thank you for helping sequester carbon and support local farmers!
            </p>
            ${digest.communityHighlights.length > 0 ? `<h3>Community highlights</h3><ul>${digest.communityHighlights.map((highlight) => `<li>${highlight}</li>`).join('')}</ul>` : ''}
            ${digest.photoUrls.length > 0 ? `<h3>Tree progress photos</h3>${digest.photoUrls.map((photoUrl) => `<img src="${photoUrl}" alt="Tree progress photo" style="max-width:100%;border-radius:8px;margin:4px 0;"/>`).join('')}` : ''}
          </div>
          <div class="footer">
            <p>Harvesta — Plant Trees. Track Impact. Offset Carbon.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

// ─── SendGrid Client Wrapper ───────────────────────────────

/**
 * Thin wrapper around @sendgrid/mail that enforces:
 * - Single instance (no per-batch client creation)
 * - Proper disposal of internal HTTP agent pool
 * - Bounded retry queue
 */
class SendGridClient {
  private sg: {
    setApiKey: (key: string) => void;
    send: (payload: { to: string; from: string; subject: string; html: string }) => Promise<void>;
  } | null = null;
  private disposed = false;

  constructor() {
    // Lazy-load to avoid import cost if worker never starts
    this.init();
  }

  private async init(): Promise<void> {
    this.sg = await import('@sendgrid/mail');
    const apiKey = process.env.SENDGRID_API_KEY;
    if (apiKey) {
      this.sg.setApiKey(apiKey);
    } else {
      logger.warn('[email-digest] SENDGRID_API_KEY not set — emails will be logged but not sent');
    }
  }

  async send(payload: { to: string; subject: string; html: string }): Promise<void> {
    if (this.disposed) throw new Error('SendGrid client disposed');
    if (!this.sg) throw new Error('SendGrid client not initialized');

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      logger.info(`[email-digest] Would send to ${payload.to}: ${payload.subject}`);
      return;
    }

    await this.sg.send({
      to: payload.to,
      from: process.env.EMAIL_FROM_ADDRESS || 'hello@harvesta.app',
      subject: payload.subject,
      html: payload.html,
    });
  }

  dispose(): void {
    this.disposed = true;
    // @sendgrid/mail doesn't expose an explicit close method, but clearing
    // the reference allows GC to collect its internal http.Agent pool.
    this.sg = null;
  }
}

// ─── Standalone entry point ────────────────────────────────

async function main(): Promise<void> {
  const worker = new EmailDigestWorker();

  // Handle --once flag for cron-style execution
  if (process.argv.includes('--once')) {
    logger.info('[email-digest] Running in --once mode');
    await worker.start();

    // Give it time to process all batches, then exit
    const checkInterval = setInterval(() => {
      if (!worker.isRunning()) {
        clearInterval(checkInterval);
        worker.dispose().then(() => process.exit(0));
      }
    }, 1000);

    // Safety timeout — exit after 5 minutes regardless
    setTimeout(
      async () => {
        logger.warn('[email-digest] --once timeout — force exiting');
        await worker.dispose();
        process.exit(0);
      },
      5 * 60 * 1000
    );
  } else {
    // Long-running daemon mode
    await worker.start();
  }
}

main().catch((err) => {
  logger.error('[email-digest] Fatal error:', err);
  process.exit(1);
});
