import { describe, it, expect } from 'vitest';
import {
  buildSignatureHeaders,
  computeSignature,
  verifySignature,
  WEBHOOK_HEADERS,
} from '@/lib/webhook/signature';

const SECRET = 'whsec_test_0123456789abcdef0123456789abcdef';
const BODY = JSON.stringify({ id: 'evt_1', type: 'milestone.payout.approved', data: { x: 1 } });

describe('webhook signature', () => {
  it('produces the three signing headers with a v1= signature', () => {
    const headers = buildSignatureHeaders(BODY, SECRET, 'evt_1', 1_700_000_000);

    expect(headers[WEBHOOK_HEADERS.id]).toBe('evt_1');
    expect(headers[WEBHOOK_HEADERS.timestamp]).toBe('1700000000');
    expect(headers[WEBHOOK_HEADERS.signature]).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it('verifies a signature it produced (round trip)', () => {
    const ts = 1_700_000_000;
    const headers = buildSignatureHeaders(BODY, SECRET, 'evt_1', ts);

    const ok = verifySignature(
      BODY,
      SECRET,
      headers[WEBHOOK_HEADERS.timestamp],
      headers[WEBHOOK_HEADERS.signature],
      { now: ts }
    );
    expect(ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = 1_700_000_000;
    const headers = buildSignatureHeaders(BODY, SECRET, 'evt_1', ts);

    const ok = verifySignature(
      `${BODY} tampered`,
      SECRET,
      headers[WEBHOOK_HEADERS.timestamp],
      headers[WEBHOOK_HEADERS.signature],
      { now: ts }
    );
    expect(ok).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const ts = 1_700_000_000;
    const headers = buildSignatureHeaders(BODY, SECRET, 'evt_1', ts);

    const ok = verifySignature(
      BODY,
      'whsec_wrong_secret_value_padding_padding',
      headers[WEBHOOK_HEADERS.timestamp],
      headers[WEBHOOK_HEADERS.signature],
      { now: ts }
    );
    expect(ok).toBe(false);
  });

  it('rejects a stale timestamp outside tolerance (replay protection)', () => {
    const ts = 1_700_000_000;
    const headers = buildSignatureHeaders(BODY, SECRET, 'evt_1', ts);

    const ok = verifySignature(
      BODY,
      SECRET,
      headers[WEBHOOK_HEADERS.timestamp],
      headers[WEBHOOK_HEADERS.signature],
      { now: ts + 10_000, toleranceSeconds: 300 }
    );
    expect(ok).toBe(false);
  });

  it('accepts a bare hex signature without the v1= prefix', () => {
    const ts = 1_700_000_000;
    const bare = computeSignature(BODY, SECRET, ts);

    expect(verifySignature(BODY, SECRET, String(ts), bare, { now: ts })).toBe(true);
  });

  it('folds the timestamp into the signature (different ts → different sig)', () => {
    expect(computeSignature(BODY, SECRET, 1)).not.toBe(computeSignature(BODY, SECRET, 2));
  });
});
