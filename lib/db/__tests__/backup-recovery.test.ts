import { describe, it, expect } from 'vitest';
import { encryptBackup, decryptBackup } from '../backup-recovery';

describe('Database Backup and Recovery Encryption', () => {
  const validKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('encrypts and decrypts buffer payload correctly with matching key', () => {
    const rawData = Buffer.from('CREATE TABLE trees (id INT PRIMARY KEY, species TEXT);');
    const encrypted = encryptBackup(rawData, validKeyHex);

    expect(encrypted.length).toBeGreaterThan(rawData.length);
    expect(encrypted).not.toEqual(rawData);

    const decrypted = decryptBackup(encrypted, validKeyHex);
    expect(decrypted.toString('utf8')).toBe(rawData.toString('utf8'));
  });

  it('throws error when encryption key length is invalid', () => {
    const rawData = Buffer.from('test payload');
    expect(() => encryptBackup(rawData, 'shortkey')).toThrow(
      'BACKUP_ENCRYPTION_KEY must be a 64-character hex string'
    );
  });

  it('throws error when decrypting truncated or invalid buffer payload', () => {
    const shortBuffer = Buffer.from('short');
    expect(() => decryptBackup(shortBuffer, validKeyHex)).toThrow(
      'Invalid encrypted backup payload (too short)'
    );
  });
});
