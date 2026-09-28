import { describe, expect, it } from 'vitest';
import {
  GIFT_CO2_KG_PER_TREE_PER_YEAR,
  GIFT_MESSAGE_MAX_LENGTH,
  buildGiftShareUrl,
  createGiftCertificate,
  decodeGiftShareToken,
  encodeGiftShareToken,
  generateGiftCode,
  renderGiftCertificateEmail,
  validateGiftCertificateInput,
  type GiftCertificateInput,
} from '@/lib/gift/giftCertificate';
import {
  giftCertificateFileName,
  giftCertificatePdfBytes,
  hexToRgb,
} from '@/lib/gift/giftCertificatePdf';

const NOW = new Date('2026-05-01T12:00:00Z');

const VALID_INPUT: GiftCertificateInput = {
  recipientName: 'Amara Okafor',
  recipientEmail: 'amara@example.com',
  senderName: 'Jonah',
  message: 'Happy birthday! May your forest grow as bright as you are. 🌱',
  treeCount: 5,
  species: 'Grevillea robusta',
  region: 'Kenya Highlands',
  occasion: 'birthday',
  theme: 'forest',
};

function certificate() {
  return createGiftCertificate(VALID_INPUT, { now: NOW, code: 'GIFT-ABCD-2345' });
}

describe('validateGiftCertificateInput', () => {
  it('accepts a complete gift', () => {
    const result = validateGiftCertificateInput(VALID_INPUT);
    expect(result.ok).toBe(true);
  });

  it('trims fields and strips control characters', () => {
    const result = validateGiftCertificateInput({
      ...VALID_INPUT,
      recipientName: '  Amara\u0007 ',
    });
    expect(result.ok && result.value.recipientName).toBe('Amara');
  });

  it('reports every invalid field', () => {
    const result = validateGiftCertificateInput({
      recipientName: '',
      senderName: '',
      recipientEmail: 'not-an-email',
      message: 'x'.repeat(GIFT_MESSAGE_MAX_LENGTH + 1),
      treeCount: 0,
      occasion: 'graduation',
      theme: 'neon',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        [
          'message',
          'occasion',
          'recipientEmail',
          'recipientName',
          'senderName',
          'theme',
          'treeCount',
        ].sort()
      );
    }
  });

  it('rejects fractional tree counts', () => {
    expect(validateGiftCertificateInput({ ...VALID_INPUT, treeCount: 1.5 }).ok).toBe(false);
  });

  it('handles non-object input', () => {
    expect(validateGiftCertificateInput(null).ok).toBe(false);
  });
});

describe('createGiftCertificate', () => {
  it('computes yearly CO₂ impact and defaults', () => {
    const cert = createGiftCertificate(
      { ...VALID_INPUT, species: undefined, region: undefined, message: undefined },
      { now: NOW }
    );
    expect(cert.co2KgPerYear).toBe(5 * GIFT_CO2_KG_PER_TREE_PER_YEAR);
    expect(cert.species).toBeTruthy();
    expect(cert.region).toBeTruthy();
    expect(cert.message).toBe('');
    expect(cert.issuedAt).toBe(NOW.toISOString());
    expect(cert.code).toMatch(/^GIFT-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});

describe('generateGiftCode', () => {
  it('avoids ambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateGiftCode().slice('GIFT-'.length)).not.toMatch(/[01IO]/);
    }
  });

  it('is driven by the supplied random source', () => {
    const code = generateGiftCode(() => new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toBe('GIFT-ABCD-EFGH');
  });
});

describe('share tokens', () => {
  it('round-trips a certificate, including unicode', () => {
    const cert = certificate();
    const decoded = decodeGiftShareToken(encodeGiftShareToken(cert));
    expect(decoded).toEqual({ ...cert, recipientEmail: undefined });
  });

  it('never embeds the recipient email', () => {
    const token = encodeGiftShareToken(certificate());
    expect(atob(token.replace(/-/g, '+').replace(/_/g, '/'))).not.toContain('amara@example.com');
  });

  it('produces URL-safe tokens', () => {
    expect(encodeGiftShareToken(certificate())).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects malformed or tampered tokens', () => {
    expect(decodeGiftShareToken('')).toBeNull();
    expect(decodeGiftShareToken('not a token!')).toBeNull();
    expect(decodeGiftShareToken('bm90LWpzb24')).toBeNull(); // "not-json"

    const tampered = btoa(JSON.stringify({ v: 1, c: 'GIFT-ABCD-2345', t: -3 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(decodeGiftShareToken(tampered)).toBeNull();
  });

  it('builds share URLs without doubled slashes', () => {
    const url = buildGiftShareUrl(certificate(), 'https://harvesta.app/');
    expect(url.startsWith('https://harvesta.app/gift/')).toBe(true);
  });
});

describe('renderGiftCertificateEmail', () => {
  it('includes the key details in text and html', () => {
    const email = renderGiftCertificateEmail(certificate(), 'https://harvesta.app/gift/abc');
    expect(email.subject).toContain('Jonah sponsored 5 trees');
    expect(email.text).toContain('Amara Okafor');
    expect(email.text).toContain('https://harvesta.app/gift/abc');
    expect(email.html).toContain('A Birthday Gift That Grows');
    expect(email.html).toContain('GIFT-ABCD-2345');
  });

  it('escapes user-provided content in html', () => {
    const cert = createGiftCertificate(
      { ...VALID_INPUT, recipientName: '<script>x</script>', message: 'a "quote" & more' },
      { now: NOW, code: 'GIFT-ABCD-2345' }
    );
    const { html } = renderGiftCertificateEmail(cert, 'https://harvesta.app/gift/abc');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;quote&quot; &amp; more');
  });
});

describe('gift certificate PDF', () => {
  it('produces a PDF document', () => {
    const bytes = new Uint8Array(
      giftCertificatePdfBytes(certificate(), 'https://harvesta.app/gift/abc')
    );
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('names files after the recipient and code', () => {
    expect(giftCertificateFileName(certificate())).toBe(
      'gift-certificate-amara-okafor-GIFT-ABCD-2345.pdf'
    );
  });

  it('parses hex colours', () => {
    expect(hexToRgb('#1F5E3B')).toEqual([31, 94, 59]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('nope')).toEqual([0, 0, 0]);
  });
});
