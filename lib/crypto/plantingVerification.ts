import { createDecipheriv, privateDecrypt, constants } from 'crypto';

export interface ClientEncryptedPayload {
  iv: string;
  ciphertext: string;
}

export interface DecryptedPlantingPayload {
  gps: {
    lat: number;
    lon: number;
  };
}

export function getPlantingVerificationPublicKey(): string | null {
  return process.env.PLANTING_VERIFICATION_PUBLIC_KEY ?? null;
}

export function unwrapPlantingVerificationKey(wrappedKey: string): Buffer {
  const privateKey = process.env.PLANTING_VERIFICATION_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('PLANTING_VERIFICATION_PRIVATE_KEY env var is required');
  }

  return privateDecrypt(
    {
      key: privateKey.replace(/\\n/g, '\n'),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(wrappedKey, 'base64')
  );
}

export function decryptClientPayload<T>(wrappedKey: string, payload: ClientEncryptedPayload): T {
  const aesKey = unwrapPlantingVerificationKey(wrappedKey);
  const encrypted = Buffer.from(payload.ciphertext, 'base64');
  const ciphertext = encrypted.subarray(0, -16);
  const authTag = encrypted.subarray(-16);
  const decipher = createDecipheriv('aes-256-gcm', aesKey, Buffer.from(payload.iv, 'base64'));

  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return JSON.parse(plaintext.toString('utf8')) as T;
}
