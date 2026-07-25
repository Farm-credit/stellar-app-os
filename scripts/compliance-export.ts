#!/usr/bin/env node
/**
 * Scheduled Compliance Report Export Script
 *
 * This script can be run as a cron job to generate scheduled compliance reports.
 * Usage:
 *   tsx scripts/compliance-export.ts [options]
 *
 * Options:
 *   --type <type>           Report type (default: carbon-credits)
 *   --format <format>       Output format: csv, json, both (default: csv)
 *   --registry <registry>   Registry standard (default: verra)
 *   --output <path>         Output directory (default: ./exports/compliance)
 *   --cron <expression>     Cron expression for scheduling (default: 0 2 * * *)
 *   --webhook <url>         Webhook URL for notifications
 *   --email <emails>        Comma-separated email addresses
 *   --retention <days>      Retention days for exported files (default: 90)
 *   --dry-run              Run once without scheduling
 */

import { parseArgs } from 'node:util';
import {
  ComplianceReportGenerator,
  getComplianceReportGenerator,
} from '@/lib/compliance/report-generator';
import { logger } from '@/lib/logger';

interface CliOptions {
  type?: string;
  format?: string;
  registry?: string;
  output?: string;
  cron?: string;
  webhook?: string;
  email?: string;
  retention?: string;
  dryRun?: boolean;
}

async function main() {
  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      type: { type: 'string', short: 't', default: 'carbon-credits' },
      format: { type: 'string', short: 'f', default: 'csv' },
      registry: { type: 'string', short: 'r', default: 'verra' },
      output: { type: 'string', short: 'o', default: './exports/compliance' },
      cron: { type: 'string', short: 'c', default: '0 2 * * *' },
      webhook: { type: 'string', short: 'w' },
      email: { type: 'string', short: 'e' },
      retention: { type: 'string', short: 'd', default: '90' },
      dryRun: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const options = args.values as CliOptions;

  console.log('🚀 Stellar App OS - Compliance Report Generator');
  console.log('================================================');
  console.log(`Report Type: ${options.type}`);
  console.log(`Format: ${options.format}`);
  console.log(`Registry: ${options.registry}`);
  console.log(`Output: ${options.output}`);
  console.log('');

  const generator = getComplianceReportGenerator({
    enabled: true,
    reportType: options.type as any,
    format: options.format as any,
    registry: options.registry as any,
    outputPath: options.output,
    webhookUrl: options.webhook,
    emailRecipients: options.email ? options.email.split(',').map((e) => e.trim()) : [],
    retentionDays: parseInt(options.retention || '90', 10),
  });

  if (options.dryRun) {
    console.log('🏃 Running one-time export (dry run)...');
    const result = await generator.runScheduledExport();

    console.log('\n📊 Export Result:');
    console.log(`  Job ID: ${result.jobId}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Started: ${result.startedAt}`);
    console.log(`  Completed: ${result.completedAt || 'N/A'}`);
    console.log(`  Records: ${result.recordsExported || 0}`);
    console.log(`  File: ${result.filePath || 'N/A'}`);
    if (result.error) console.log(`  Error: ${result.error}`);

    process.exit(result.status === 'completed' ? 0 : 1);
  }

  console.log(`⏰ Scheduling with cron: ${options.cron}`);
  console.log('📡 Webhook:', options.webhook || 'none');
  console.log('📧 Email:', options.email || 'none');
  console.log('');

  if (options.webhook) {
    console.log('🔔 Webhook notifications enabled');
  }

  if (options.email) {
    console.log('📧 Email notifications enabled for:', options.email);
  }

  console.log('📋 Press Ctrl+C to stop\n');

  const cron = await import('node-cron');
  const task = cron.default.schedule(options.cron, async () => {
    console.log(`\n[${new Date().toISOString()}] Running scheduled export...`);
    try {
      const result = await generator.runScheduledExport();
      console.log(
        `[${new Date().toISOString()}] Export ${result.status}: ${result.recordsExported || 0} records`
      );
      if (result.error) console.error(`[${new Date().toISOString()}] Error: ${result.error}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Export failed:`, error);
    }
  });

  task.start();

  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping scheduler...');
    task.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping scheduler...');
    task.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
