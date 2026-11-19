import { execFile } from 'child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { promisify } from 'util';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const execFileAsync = promisify(execFile);

export interface BackupOptions {
  databaseUrl?: string;
  encryptionKeyHex?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3Prefix?: string;
  retentionDays?: number;
}

export interface BackupResult {
  s3Key: string;
  bytesOriginal: number;
  bytesEncrypted: number;
  timestamp: string;
  prunedCount: number;
}

export interface RecoveryOptions {
  s3Key: string;
  databaseUrl?: string;
  encryptionKeyHex?: string;
  s3Bucket?: string;
  s3Region?: string;
}

export interface RecoveryResult {
  s3Key: string;
  restoredAt: string;
  success: boolean;
}

/**
 * Encrypts a buffer using AES-256-GCM.
 * Output layout: [12-byte IV][16-byte Auth Tag][Ciphertext]
 */
export function encryptBackup(plaintext: Buffer, keyHex: string): Buffer {
  if (keyHex.length !== 64) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

/**
 * Decrypts an AES-256-GCM encrypted backup buffer.
 */
export function decryptBackup(encryptedBuffer: Buffer, keyHex: string): Buffer {
  if (keyHex.length !== 64) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  if (encryptedBuffer.length < 28) {
    throw new Error('Invalid encrypted backup payload (too short)');
  }

  const key = Buffer.from(keyHex, 'hex');
  const iv = encryptedBuffer.subarray(0, 12);
  const tag = encryptedBuffer.subarray(12, 28);
  const ciphertext = encryptedBuffer.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function getS3Client(region: string): S3Client {
  return new S3Client({
    region: region || process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

/**
 * Runs pg_dump to produce a custom format PostgreSQL snapshot.
 */
export async function runPgDump(databaseUrl: string): Promise<Buffer> {
  const { stdout } = await execFileAsync('pg_dump', ['--format=custom', databaseUrl], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024 * 1024, // 1 GB limit
  });
  return stdout;
}

/**
 * Runs pg_restore (or psql) to restore database from snapshot.
 */
export async function runPgRestore(databaseUrl: string, dumpBuffer: Buffer): Promise<void> {
  // Pass buffer to pg_restore stdin
  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      'pg_restore',
      ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', databaseUrl],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
    if (child.stdin) {
      child.stdin.write(dumpBuffer);
      child.stdin.end();
    } else {
      reject(new Error('Failed to open stdin for pg_restore process'));
    }
  });
}

/**
 * Automates daily database backups: dump -> encrypt -> S3 upload -> retention prune.
 */
export async function createDatabaseBackup(options: BackupOptions = {}): Promise<BackupResult> {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL environment variable is required');

  const keyHex = options.encryptionKeyHex || process.env.BACKUP_ENCRYPTION_KEY;
  if (!keyHex) throw new Error('BACKUP_ENCRYPTION_KEY environment variable is required');

  const s3Bucket = options.s3Bucket || process.env.AWS_S3_BUCKET;
  if (!s3Bucket) throw new Error('AWS_S3_BUCKET environment variable is required');

  const s3Region = options.s3Region || process.env.AWS_REGION || 'us-east-1';
  const prefix = options.s3Prefix || process.env.BACKUP_S3_PREFIX || 'db-backups/';
  const retentionDays =
    options.retentionDays || parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);

  console.log('[Backup] Starting database dump...');
  const dumpBuffer = await runPgDump(databaseUrl);

  console.log(`[Backup] Encrypting dump (${dumpBuffer.length} bytes)...`);
  const encrypted = encryptBackup(dumpBuffer, keyHex);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const s3Key = `${prefix}pg-dump-${timestamp}.dump.enc`;

  const s3 = getS3Client(s3Region);
  console.log(`[Backup] Uploading to s3://${s3Bucket}/${s3Key}...`);
  await s3.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
      Body: encrypted,
      ContentType: 'application/octet-stream',
      Metadata: {
        timestamp: new Date().toISOString(),
        original_size: dumpBuffer.length.toString(),
      },
    })
  );

  // Prune older backups
  let prunedCount = 0;
  try {
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: s3Bucket,
        Prefix: prefix,
      })
    );

    if (listRes.Contents && listRes.Contents.length > 0) {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const toDelete = listRes.Contents.filter(
        (obj) => obj.LastModified && obj.LastModified.getTime() < cutoff && obj.Key
      ).map((obj) => ({ Key: obj.Key! }));

      if (toDelete.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: s3Bucket,
            Delete: { Objects: toDelete },
          })
        );
        prunedCount = toDelete.length;
        console.log(`[Backup] Pruned ${prunedCount} old backups older than ${retentionDays} days.`);
      }
    }
  } catch (pruneErr) {
    console.warn('[Backup] Warning: Failed to prune old backups:', pruneErr);
  }

  return {
    s3Key,
    bytesOriginal: dumpBuffer.length,
    bytesEncrypted: encrypted.length,
    timestamp: new Date().toISOString(),
    prunedCount,
  };
}

/**
 * Automates database recovery from an encrypted S3 snapshot.
 */
export async function restoreDatabaseFromBackup(options: RecoveryOptions): Promise<RecoveryResult> {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL environment variable is required');

  const keyHex = options.encryptionKeyHex || process.env.BACKUP_ENCRYPTION_KEY;
  if (!keyHex) throw new Error('BACKUP_ENCRYPTION_KEY environment variable is required');

  const s3Bucket = options.s3Bucket || process.env.AWS_S3_BUCKET;
  if (!s3Bucket) throw new Error('AWS_S3_BUCKET environment variable is required');

  const s3Region = options.s3Region || process.env.AWS_REGION || 'us-east-1';
  const s3 = getS3Client(s3Region);

  console.log(`[Recovery] Downloading backup from s3://${s3Bucket}/${options.s3Key}...`);
  const getRes = await s3.send(
    new GetObjectCommand({
      Bucket: s3Bucket,
      Key: options.s3Key,
    })
  );

  const chunks: Buffer[] = [];
  if (getRes.Body) {
    for await (const chunk of getRes.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
  }
  const encryptedBuffer = Buffer.concat(chunks);

  console.log(`[Recovery] Decrypting backup buffer (${encryptedBuffer.length} bytes)...`);
  const decryptedBuffer = decryptBackup(encryptedBuffer, keyHex);

  console.log(`[Recovery] Restoring database using pg_restore...`);
  await runPgRestore(databaseUrl, decryptedBuffer);

  return {
    s3Key: options.s3Key,
    restoredAt: new Date().toISOString(),
    success: true,
  };
}
