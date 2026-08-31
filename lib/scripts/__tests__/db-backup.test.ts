/**
 * Unit tests for scripts/db-backup.mjs — Issue #677
 *
 * Covers:
 *   • AES-256-GCM encrypt: ciphertext differs from plaintext, roundtrip decodes
 *   • encrypt: rejects wrong-length key
 *   • uploadToS3: calls PutObjectCommand with correct params
 *   • pruneOldBackups: deletes only objects older than retention window
 *   • pruneOldBackups: returns 0 when nothing to prune
 *   • pruneOldBackups: handles paginated listing
 *   • error paths: uploadToS3 propagates S3 errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDecipheriv } from 'node:crypto';

// ── Import the functions under test ───────────────────────────────────────────
// We import directly from the mjs source; vitest handles ESM.

// Use a dynamic import so we can resolve the path relative to the project root.
const { encrypt, uploadToS3, pruneOldBackups } = await import('../../../scripts/db-backup.mjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Valid 64-char hex key (32 bytes) */
const TEST_KEY = 'a'.repeat(64);

/** Decrypt output produced by encrypt() */
function decrypt(cipherBuf, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = cipherBuf.subarray(0, 12);
  const tag = cipherBuf.subarray(12, 28);
  const ciphertext = cipherBuf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Build a mock S3Client */
function mockS3(overrides = {}) {
  return { send: vi.fn(overrides.send ?? (() => Promise.resolve({}))) };
}

// ── encrypt ───────────────────────────────────────────────────────────────────

describe('encrypt', () => {
  it('produces output longer than plaintext (IV + tag overhead)', () => {
    const plain = Buffer.from('hello world');
    const out = encrypt(plain, TEST_KEY);
    expect(out.length).toBeGreaterThan(plain.length);
  });

  it('output starts with 12-byte IV and 16-byte tag (28 bytes before ciphertext)', () => {
    const plain = Buffer.from('test');
    const out = encrypt(plain, TEST_KEY);
    // 12 (IV) + 16 (tag) + 4 (ciphertext) = 32 bytes minimum
    expect(out.length).toBe(12 + 16 + plain.length);
  });

  it('ciphertext differs from plaintext', () => {
    const plain = Buffer.from('sensitive data');
    const out = encrypt(plain, TEST_KEY);
    expect(out.subarray(28).equals(plain)).toBe(false);
  });

  it('decrypted output matches original plaintext', () => {
    const plain = Buffer.from('pg_dump snapshot bytes');
    const encrypted = encrypt(plain, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted.equals(plain)).toBe(true);
  });

  it('two calls with same plaintext produce different IVs (non-deterministic)', () => {
    const plain = Buffer.from('data');
    const a = encrypt(plain, TEST_KEY);
    const b = encrypt(plain, TEST_KEY);
    expect(a.subarray(0, 12).equals(b.subarray(0, 12))).toBe(false);
  });

  it('throws when key is not 64 hex chars', () => {
    expect(() => encrypt(Buffer.from('x'), 'short')).toThrow(
      'BACKUP_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)'
    );
  });
});

// ── uploadToS3 ────────────────────────────────────────────────────────────────

describe('uploadToS3', () => {
  it('calls s3.send with a PutObjectCommand-like payload', async () => {
    const s3 = mockS3();
    const body = Buffer.from('encrypted bytes');
    await uploadToS3(s3, 'my-bucket', 'db-backups/test.enc', body);

    expect(s3.send).toHaveBeenCalledOnce();
    const cmd = s3.send.mock.calls[0][0];
    expect(cmd.input).toMatchObject({
      Bucket: 'my-bucket',
      Key: 'db-backups/test.enc',
      Body: body,
      ContentType: 'application/octet-stream',
      ServerSideEncryption: 'AES256',
    });
  });

  it('propagates S3 errors to the caller', async () => {
    const s3 = mockS3({ send: () => Promise.reject(new Error('S3 unavailable')) });
    await expect(uploadToS3(s3, 'bucket', 'key', Buffer.alloc(0))).rejects.toThrow(
      'S3 unavailable'
    );
  });
});

// ── pruneOldBackups ───────────────────────────────────────────────────────────

describe('pruneOldBackups', () => {
  const BUCKET = 'backup-bucket';
  const PREFIX = 'db-backups/';
  const RETENTION = 30;

  const now = new Date('2026-06-28T00:00:00Z');
  const old = new Date('2026-05-01T00:00:00Z'); // 58 days ago
  const recent = new Date('2026-06-20T00:00:00Z'); // 8 days ago

  beforeEach(() => {
    vi.setSystemTime(now);
  });

  it('returns 0 when no objects are older than retention window', async () => {
    const s3 = mockS3({
      send: vi.fn().mockResolvedValue({
        Contents: [{ Key: 'db-backups/recent.enc', LastModified: recent }],
        IsTruncated: false,
      }),
    });
    const deleted = await pruneOldBackups(s3, BUCKET, PREFIX, RETENTION);
    expect(deleted).toBe(0);
    // Should not call DeleteObjects
    const calls = s3.send.mock.calls.map((c) => c[0].constructor?.name);
    expect(calls).not.toContain('DeleteObjectsCommand');
  });

  it('deletes objects older than retention window and returns count', async () => {
    const s3 = mockS3({
      send: vi.fn((cmd) => {
        if (cmd.constructor?.name === 'ListObjectsV2Command') {
          return Promise.resolve({
            Contents: [
              { Key: 'db-backups/old.enc', LastModified: old },
              { Key: 'db-backups/recent.enc', LastModified: recent },
            ],
            IsTruncated: false,
          });
        }
        return Promise.resolve({});
      }),
    });

    const deleted = await pruneOldBackups(s3, BUCKET, PREFIX, RETENTION);
    expect(deleted).toBe(1);

    const deleteCalls = s3.send.mock.calls.filter(
      (c) => c[0].constructor?.name === 'DeleteObjectsCommand'
    );
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][0].input.Delete.Objects).toEqual([{ Key: 'db-backups/old.enc' }]);
  });

  it('handles empty Contents (no objects under prefix)', async () => {
    const s3 = mockS3({
      send: vi.fn().mockResolvedValue({ Contents: [], IsTruncated: false }),
    });
    const deleted = await pruneOldBackups(s3, BUCKET, PREFIX, RETENTION);
    expect(deleted).toBe(0);
  });

  it('handles undefined Contents gracefully', async () => {
    const s3 = mockS3({
      send: vi.fn().mockResolvedValue({ IsTruncated: false }),
    });
    const deleted = await pruneOldBackups(s3, BUCKET, PREFIX, RETENTION);
    expect(deleted).toBe(0);
  });

  it('follows pagination tokens to list all objects', async () => {
    let page = 0;
    const s3 = mockS3({
      send: vi.fn((cmd) => {
        if (cmd.constructor?.name === 'ListObjectsV2Command') {
          page += 1;
          if (page === 1) {
            return Promise.resolve({
              Contents: [{ Key: 'db-backups/old1.enc', LastModified: old }],
              IsTruncated: true,
              NextContinuationToken: 'token-2',
            });
          }
          return Promise.resolve({
            Contents: [{ Key: 'db-backups/old2.enc', LastModified: old }],
            IsTruncated: false,
          });
        }
        return Promise.resolve({});
      }),
    });

    const deleted = await pruneOldBackups(s3, BUCKET, PREFIX, RETENTION);
    expect(deleted).toBe(2);
  });

  it('deletes objects older than exactly RETENTION_DAYS', async () => {
    // Object exactly at the cutoff boundary (should NOT be deleted)
    const exactCutoff = new Date(now.getTime() - RETENTION * 24 * 60 * 60 * 1000);
    const justOver = new Date(exactCutoff.getTime() - 1000); // 1s past cutoff

    const s3 = mockS3({
      send: vi.fn((cmd) => {
        if (cmd.constructor?.name === 'ListObjectsV2Command') {
          return Promise.resolve({
            Contents: [
              { Key: 'db-backups/boundary.enc', LastModified: exactCutoff },
              { Key: 'db-backups/justover.enc', LastModified: justOver },
            ],
            IsTruncated: false,
          });
        }
        return Promise.resolve({});
      }),
    });

    const deleted = await pruneOldBackups(s3, BUCKET, PREFIX, RETENTION);
    // exactCutoff is NOT < cutoff, justOver IS < cutoff
    expect(deleted).toBe(1);
  });
});
