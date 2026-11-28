import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
  getSecretLastFour,
  maskWebhookSecret,
} from '../secrets';

const ORIGINAL_KEY = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  } else {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

describe('webhook secrets encryption & masking', () => {
  it('generates whsec_* secrets and masks them to last four chars', () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_[0-9a-f]{64}$/);
    const last4 = getSecretLastFour(secret);
    expect(maskWebhookSecret(last4)).toBe(`whsec_••••${last4}`);
  });

  it('encrypts and decrypts secrets round-trip with AES-256-GCM', () => {
    const secret = generateWebhookSecret();
    const encrypted = encryptWebhookSecret(secret);
    expect(encrypted).toMatch(/^v1:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(encrypted).not.toContain(secret);
    expect(decryptWebhookSecret(encrypted)).toBe(secret);
  });

  it('fails closed when encryption key is missing or ciphertext is tampered', () => {
    const encrypted = encryptWebhookSecret('whsec_test_1234');
    const tampered = `${encrypted.slice(0, -2)}ff`;
    expect(() => decryptWebhookSecret(tampered)).toThrow();

    delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    expect(() => encryptWebhookSecret('whsec_test_1234')).toThrow(/WEBHOOK_SECRET_ENCRYPTION_KEY/);
  });
});
