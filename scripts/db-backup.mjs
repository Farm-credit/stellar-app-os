/**
 * db-backup.mjs — Issue #677
 *
 * Runs pg_dump, encrypts the snapshot with AES-256-GCM, uploads it to S3,
 * and prunes backups older than 30 days from the same S3 prefix.
 *
 * Usage:
 *   node scripts/db-backup.mjs
 *
 * Required env vars:
 *   DATABASE_URL            — postgres connection string
 *   BACKUP_ENCRYPTION_KEY   — 32-byte hex key (64 hex chars) for AES-256-GCM
 *   AWS_S3_BUCKET           — target S3 bucket name
 *   AWS_REGION              — AWS region (default: us-east-1)
 *   AWS_ACCESS_KEY_ID       — AWS credentials
 *   AWS_SECRET_ACCESS_KEY   — AWS credentials
 *
 * Optional:
 *   BACKUP_S3_PREFIX        — S3 key prefix (default: "db-backups/")
 *   BACKUP_RETENTION_DAYS   — days to retain (default: 30)
 */

import { execFile } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const execFileAsync = promisify(execFile);

// ── Config ────────────────────────────────────────────────────────────────────

const S3_PREFIX = process.env.BACKUP_S3_PREFIX ?? 'db-backups/';
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypts a buffer using AES-256-GCM.
 * Output layout: [12-byte IV][16-byte auth tag][ciphertext]
 *
 * @param {Buffer} plaintext
 * @param {string} keyHex   — 64-char hex string (32 bytes)
 * @returns {Buffer}
 */
export function encrypt(plaintext, keyHex) {
  if (keyHex.length !== 64) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

// ── pg_dump ───────────────────────────────────────────────────────────────────

/**
 * Runs pg_dump and returns the dump as a Buffer.
 *
 * @param {string} databaseUrl
 * @returns {Promise<Buffer>}
 */
export async function runPgDump(databaseUrl) {
  const { stdout } = await execFileAsync('pg_dump', ['--format=custom', databaseUrl], {
    encoding: 'buffer',
    maxBuffer: 512 * 1024 * 1024, // 512 MB
  });
  return stdout;
}

// ── S3 helpers ────────────────────────────────────────────────────────────────

function buildS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
    },
  });
}

/**
 * Uploads an encrypted buffer to S3.
 *
 * @param {S3Client} s3
 * @param {string} bucket
 * @param {string} key
 * @param {Buffer} body
 */
export async function uploadToS3(s3, bucket, key, body) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/octet-stream',
      ServerSideEncryption: 'AES256',
    }),
  );
}

/**
 * Deletes all S3 objects under `prefix` whose LastModified is older than
 * `retentionDays` days.
 *
 * @param {S3Client} s3
 * @param {string} bucket
 * @param {string} prefix
 * @param {number} retentionDays
 * @returns {Promise<number>} number of objects deleted
 */
export async function pruneOldBackups(s3, bucket, prefix, retentionDays) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const toDelete = [];
  let continuationToken;

  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of resp.Contents ?? []) {
      if (obj.LastModified && obj.LastModified < cutoff) {
        toDelete.push({ Key: obj.Key });
      }
    }

    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  if (toDelete.length === 0) return 0;

  // DeleteObjects accepts up to 1000 keys per call
  for (let i = 0; i < toDelete.length; i += 1000) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: toDelete.slice(i, i + 1000), Quiet: true },
      }),
    );
  }

  return toDelete.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const databaseUrl = requireEnv('DATABASE_URL');
  const keyHex = requireEnv('BACKUP_ENCRYPTION_KEY');
  const bucket = requireEnv('AWS_S3_BUCKET');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const s3Key = `${S3_PREFIX}backup-${timestamp}.dump.enc`;

  console.log('[db-backup] running pg_dump…');
  const dump = await runPgDump(databaseUrl);
  console.log(`[db-backup] dump size: ${(dump.length / 1024).toFixed(1)} KB`);

  console.log('[db-backup] encrypting with AES-256-GCM…');
  const encrypted = encrypt(dump, keyHex);

  const s3 = buildS3Client();

  console.log(`[db-backup] uploading to s3://${bucket}/${s3Key}…`);
  await uploadToS3(s3, bucket, s3Key, encrypted);
  console.log('[db-backup] upload complete');

  console.log(`[db-backup] pruning backups older than ${RETENTION_DAYS} days…`);
  const deleted = await pruneOldBackups(s3, bucket, S3_PREFIX, RETENTION_DAYS);
  console.log(`[db-backup] pruned ${deleted} old backup(s)`);

  console.log('[db-backup] done');
}

// Run only when executed directly (not when imported by tests)
const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error('[db-backup] fatal:', err);
    process.exit(1);
  });
}
