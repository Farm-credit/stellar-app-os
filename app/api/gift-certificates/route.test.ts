/**
 * Route tests for /api/gift-certificates — Issue #1107
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { sendGiftCertificateEmail } = vi.hoisted(() => ({
  sendGiftCertificateEmail: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/lib/email/sendgrid', () => ({ sendGiftCertificateEmail }));

import { POST } from './route';
import { GET as GET_PDF } from './[token]/pdf/route';

let ipCounter = 0;

function postRequest(body: unknown, raw = false): NextRequest {
  ipCounter += 1;
  return new NextRequest('http://localhost:3000/api/gift-certificates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${ipCounter}` },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const VALID = {
  recipientName: 'Amara',
  recipientEmail: 'amara@example.com',
  senderName: 'Jonah',
  message: 'For you',
  treeCount: 3,
  occasion: 'thank-you',
  theme: 'ocean',
};

beforeEach(() => sendGiftCertificateEmail.mockClear());

describe('POST /api/gift-certificates', () => {
  it('creates a certificate with share and pdf links', async () => {
    const response = await POST(postRequest(VALID));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.certificate.code).toMatch(/^GIFT-/);
    expect(body.shareUrl).toMatch(/\/gift\/[A-Za-z0-9_-]+$/);
    expect(body.pdfUrl).toMatch(/\/api\/gift-certificates\/[A-Za-z0-9_-]+\/pdf$/);
    expect(body.emailSent).toBe(false);
    expect(sendGiftCertificateEmail).not.toHaveBeenCalled();
  });

  it('emails the recipient when asked', async () => {
    const response = await POST(postRequest({ ...VALID, sendEmail: true }));
    const body = await response.json();
    expect(body.emailSent).toBe(true);
    expect(sendGiftCertificateEmail).toHaveBeenCalledTimes(1);
    const [params] = sendGiftCertificateEmail.mock.calls[0] as unknown as [
      { to: string; pdf: { fileName: string } },
    ];
    expect(params.to).toBe('amara@example.com');
    expect(params.pdf.fileName).toMatch(/\.pdf$/);
  });

  it('returns field errors for invalid input', async () => {
    const response = await POST(postRequest({ ...VALID, treeCount: 0, theme: 'x' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors).toHaveProperty('treeCount');
    expect(body.errors).toHaveProperty('theme');
  });

  it('rejects invalid JSON', async () => {
    const response = await POST(postRequest('{', true));
    expect(response.status).toBe(400);
  });
});

describe('GET /api/gift-certificates/:token/pdf', () => {
  it('renders the certificate PDF from a share token', async () => {
    const created = await (await POST(postRequest(VALID))).json();
    const token = created.shareUrl.split('/gift/')[1];

    const response = await GET_PDF(
      new NextRequest(`http://localhost:3000/api/gift-certificates/${token}/pdf?download=1`),
      { params: Promise.resolve({ token }) }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="gift-certificate-amara-/
    );
  });

  it('returns 404 for an invalid token', async () => {
    const response = await GET_PDF(
      new NextRequest('http://localhost:3000/api/gift-certificates/bad/pdf'),
      { params: Promise.resolve({ token: 'bad' }) }
    );
    expect(response.status).toBe(404);
  });
});
