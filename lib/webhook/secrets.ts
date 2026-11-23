import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_ENV_NAME = 'WEBHOOK_SECRET_ENCRYPTION_KEY';
const SECRET_PREFIX = 'whsec_';
const CIPHER_PREFIX = 'v1';

function resolveEncryptionKey(): Buffer {
  const raw = process.env[KEY_ENV_NAME]?.trim();
  if (!raw) {
    throw new Error(`${KEY_ENV_NAME} is required to encrypt or decrypt webhook signing secrets.`);
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const base64Buf = Buffer.from(raw, 'base64');
  if (base64Buf.length === 32) {
    return base64Buf;
  }

  throw new Error(`${KEY_ENV_NAME} must be a 32-byte key encoded as 64 hex characters or base64.`);
}

export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString('hex')}`;
}

export function getSecretLastFour(secret: string): string {
  return secret.slice(-4);
}

export function maskWebhookSecret(lastFour: string | null | undefined): string {
  return `${SECRET_PREFIX}••••${lastFour ?? '****'}`;
}

export function encryptWebhookSecret(plaintext: string): string {
  const key = resolveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [CIPHER_PREFIX, iv.toString('hex'), tag.toString('hex'), ciphertext.toString('hex')].join(
    ':'
  );
}

export function decryptWebhookSecret(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 4 || parts[0] !== CIPHER_PREFIX) {
    throw new Error('Unsupported encrypted webhook secret format.');
  }

  const [, ivHex = '', tagHex = '', cipherHex = ''] = parts;
  const key = resolveEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
