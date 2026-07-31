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
import { z } from 'zod';
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

const EnvSchema = z.object({
  COMPLIANCE_EXPORT_ENABLED: z.enum(['true', 'false']).optional().default('true'),
  COMPLIANCE_EXPORT_TYPE: z.enum([
    'carbon-credits',
    'project-registry',
    'tree-inventory',
    'verification-audits',
    'issuance-report',
    'retirement-report',
  ]).optional(),
  COMPLIANCE_EXPORT_FORMAT: z.enum(['csv', 'json', 'both']).optional(),
  COMPLIANCE_EXPORT_REGISTRY: z.enum([
    'verra',
    'gold-standard',
    'car',
    'plan-vivo',
    'cdm',
    'generic',
  ]).optional(),
  COMPLIANCE_EXPORT_OUTPUT_PATH: z.string().optional(),
  COMPLIANCE_EXPORT_CRON: z.string().optional(),
  COMPLIANCE_EXPORT_WEBHOOK_URL: z.string().url().optional(),
  COMPLIANCE_EXPORT_EMAIL_RECIPIENTS: z.string().optional(),
  COMPLIANCE_EXPORT_RETENTION_DAYS: z.coerce.number().int().positive().optional(),
});

type EnvConfig = z.infer<typeof EnvSchema>;

function loadEnvConfig(): Partial<ScheduledExportConfig> {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    logger.error('Invalid environment configuration', { errors: parsed.error.flatten().fieldErrors });
    process.exit(1);
  }

  const env = parsed.data as EnvConfig;
  const config: Partial<ScheduledExportConfig> = {};

  if (env.COMPLIANCE_EXPORT_TYPE) config.reportType = env.COMPLIANCE_EXPORT_TYPE as any;
  if (env.COMPLIANCE_EXPORT_FORMAT) config.format = env.COMPLIANCE_EXPORT_FORMAT as any;
  if (env.COMPLIANCE_EXPORT_REGISTRY) config.registry = env.COMPLIANCE_EXPORT_REGISTRY as any;
  if (env.COMPLIANCE_EXPORT_OUTPUT_PATH) config.outputPath = env.COMPLIANCE_EXPORT_OUTPUT_PATH;
  if (env.COMPLIANCE_EXPORT_CRON) config.cronExpression = env.COMPLIANCE_EXPORT_CRON;
  if (env.COMPLIANCE_EXPORT_WEBHOOK_URL) config.webhookUrl = env.COMPLIANCE_EXPORT_WEBHOOK_URL;
  if (env.COMPLIANCE_EXPORT_EMAIL_RECIPIENTS) {
    config.emailRecipients = env.COMPLIANCE_EXPORT_EMAIL_RECIPIENTS.split(',').map((e) => e.trim());
  }
  if (env.COMPLIANCE_EXPORT_RETENTION_DAYS) config.retentionDays = env.COMPLIANCE_EXPORT_RETENTION_DAYS;

  return config;
}

async function main() {
  const envConfig = loadEnvConfig();

  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      type: { type: 'string', short: 't', default: envConfig.reportType ?? 'carbon-credits' },
      format: { type: 'string', short: 'f', default: envConfig.format ?? 'csv' },
      registry: { type: 'string', short: 'r', default: envConfig.registry ?? 'verra' },
      output: { type: 'string', short: 'o', default: envConfig.outputPath ?? './exports/compliance' },
      cron: { type: 'string', short: 'c', default: envConfig.cronExpression ?? '0 2 * * *' },
      webhook: { type: 'string', short: 'w' },
      email: { type: 'string', short: 'e' },
      retention: { type: 'string', short: 'd', default: String(envConfig.retentionDays ?? '90') },
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
    ...envConfig,
    enabled: true,
    reportType: options.type as any,
    format: options.format as any,
    registry: options.registry as any,
    outputPath: options.output,
    webhookUrl: options.webhook ?? envConfig.webhookUrl,
    emailRecipients: options.email
      ? options.email.split(',').map((e) => e.trim())
      : envConfig.emailRecipients ?? [],
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
