import { beforeEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import sharp from 'sharp';

vi.mock('@react-pdf/renderer', () => {
  const Component = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Document: Component,
    Page: Component,
    Text: Component,
    View: Component,
    Image: Component,
    StyleSheet: { create: (styles: unknown) => styles },
    renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('certificate-pdf')),
  };
});

import { GET } from './route';

describe('GET /api/certificates/[tree_id]', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a certificate whose QR code contains the public tree ID', async () => {
    const qrDataUrlSpy = vi.spyOn(QRCode, 'toDataURL');

    const response = await GET(new Request('http://localhost') as never, {
      params: Promise.resolve({ tree_id: 'tree-001' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(qrDataUrlSpy).toHaveBeenCalledOnce();

    const qrDataUrl = await qrDataUrlSpy.mock.results[0].value;
    const qrPng = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    const { data, info } = await sharp(qrPng).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);

    expect(decoded?.data).toBe('https://app.farmcredit.io/trees/HRV-2024-0001');
  });
});
