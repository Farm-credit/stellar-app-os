import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface AppreciationEnvelope {
  version: 1;
  algorithm: 'AES-GCM';
  iv: string;
  ciphertext: string;
  keyFingerprint: string;
}

export interface AppreciationMessage {
  id: string;
  benefactorId: string;
  stewardId: string;
  milestoneId: string;
  envelope: AppreciationEnvelope;
  tipAmount: string;
  tipAsset: string;
  transactionHash: string | null;
  createdAt: string;
}

function encode(value: Buffer): string {
  return value.toString('base64url');
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

/**
 * Encrypts a note before it crosses the API boundary. The API intentionally
 * receives only this envelope and never receives the plaintext note.
 */
export function encryptAppreciationNote(note: string, sharedSecret: string): AppreciationEnvelope {
  if (!note.trim()) throw new Error('Appreciation note cannot be empty');
  if (note.length > 500) throw new Error('Appreciation note must be 500 characters or fewer');
  if (!sharedSecret) throw new Error('A shared encryption secret is required');

  const key = createHash('sha256').update(sharedSecret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv) as {
    update(value: string, inputEncoding: BufferEncoding, outputEncoding: BufferEncoding): string;
    final(outputEncoding: BufferEncoding): string;
    getAuthTag(): Buffer;
  };
  const ciphertext = `${cipher.update(note, 'utf8', 'base64url')}${cipher.final('base64url')}.${encode(cipher.getAuthTag())}`;
  return {
    version: 1,
    algorithm: 'AES-GCM',
    iv: encode(iv),
    ciphertext,
    keyFingerprint: createHash('sha256').update(key).digest('hex').slice(0, 16),
  };
}

export function decryptAppreciationNote(
  envelope: AppreciationEnvelope,
  sharedSecret: string
): string {
  if (envelope.version !== 1 || envelope.algorithm !== 'AES-GCM') {
    throw new Error('Unsupported appreciation envelope');
  }
  const key = createHash('sha256').update(sharedSecret).digest();
  const parts = envelope.ciphertext.split('.');
  const encodedCiphertext = parts[0];
  const encodedTag = parts[1];
  if (!encodedCiphertext) throw new Error('Malformed appreciation envelope');
  const ciphertextBytes = decode(encodedCiphertext);
  const tag = encodedTag ? decode(encodedTag) : ciphertextBytes.subarray(-16);
  const encryptedBytes = encodedTag ? ciphertextBytes : ciphertextBytes.subarray(0, -16);
  if (tag.length !== 16 || encryptedBytes.length === 0)
    throw new Error('Malformed appreciation envelope');
  const decipher = createDecipheriv('aes-256-gcm', key, decode(envelope.iv)) as {
    setAuthTag(tag: Buffer): void;
    update(value: Buffer, inputEncoding: undefined, outputEncoding: BufferEncoding): string;
    final(outputEncoding: BufferEncoding): string;
  };
  decipher.setAuthTag(tag);
  return `${decipher.update(encryptedBytes, undefined, 'utf8')}${decipher.final('utf8')}`;
}

export function createAppreciationId(): string {
  return `app-${Date.now()}-${randomBytes(6).toString('hex')}`;
}
