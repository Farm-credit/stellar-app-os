#!/usr/bin/env tsx

/**
 * CLI Tool for Database Backup and Recovery Automation
 * Issue #824
 *
 * Commands:
 *   backup   — Runs pg_dump, encrypts snapshot with AES-256-GCM, uploads to S3, prunes old backups.
 *   restore  — Downloads encrypted snapshot from S3, decrypts, and restores PostgreSQL DB.
 *
 * Usage:
 *   npx tsx scripts/db-backup-recovery.ts backup
 *   npx tsx scripts/db-backup-recovery.ts restore --key=db-backups/pg-dump-2026-07-25.dump.enc
 */

import { createDatabaseBackup, restoreDatabaseFromBackup } from '../lib/db/backup-recovery';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'backup';

  if (command === 'backup') {
    console.log('[DB Automation] Initiating backup sequence...');
    try {
      const result = await createDatabaseBackup();
      console.log('[DB Automation] Backup successful!');
      console.log(`- S3 Key: ${result.s3Key}`);
      console.log(`- Original Size: ${(result.bytesOriginal / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Encrypted Size: ${(result.bytesEncrypted / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Pruned Old Backups: ${result.prunedCount}`);
      process.exit(0);
    } catch (err) {
      console.error('[DB Automation] Backup failed:', err);
      process.exit(1);
    }
  } else if (command === 'restore') {
    const keyArg = args.find((a) => a.startsWith('--key='));
    const s3Key = keyArg ? keyArg.split('=')[1] : null;

    if (!s3Key) {
      console.error('Error: --key argument is required for restore (e.g. --key=db-backups/snapshot.dump.enc)');
      process.exit(1);
    }

    console.log(`[DB Automation] Initiating restore from ${s3Key}...`);
    try {
      const result = await restoreDatabaseFromBackup({ s3Key });
      console.log('[DB Automation] Restore completed successfully!');
      console.log(`- Restored At: ${result.restoredAt}`);
      process.exit(0);
    } catch (err) {
      console.error('[DB Automation] Restore failed:', err);
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}. Use 'backup' or 'restore'.`);
    process.exit(1);
  }
}

main();
