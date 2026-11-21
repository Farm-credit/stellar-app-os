import { describe, expect, it } from 'vitest';
import {
  bulkCertificatesPdfToBuffer,
  hexToRgb,
  renderBulkCorporateCertificatesPdf,
} from '../bulkCertificatePdf';
import { createCorporateOrder } from '../packages';

describe('bulk co-branded corporate certificate PDF generator', () => {
  const sampleOrder = createCorporateOrder({
    quantity: 10,
    orderNumber: 'CORP-2026-2001',
    createdAt: '2026-10-01T12:00:00.000Z',
    branding: {
      companyName: 'Solaris Energy',
      tagline: 'Powering a Sustainable Tomorrow',
      primaryColor: '#166534',
      secondaryColor: '#0f766e',
      contactEmail: 'esg@solaris.example',
    },
  });

  it('parses valid hex colors and falls back safely on invalid hex', () => {
    expect(hexToRgb('#166534')).toEqual([22, 101, 52]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('not-a-color')).toEqual([22, 101, 52]);
  });

  it('renders one landscape PDF page per employee recipient', () => {
    const recipients = [
      {
        name: 'Amara Okafor',
        department: 'Engineering',
        treeCount: 5,
        treeCodes: sampleOrder.trees.slice(0, 5).map((t) => t.treeCode),
      },
      {
        name: 'Liam Chen',
        department: 'Product',
        treeCount: 5,
        treeCodes: sampleOrder.trees.slice(5, 10).map((t) => t.treeCode),
      },
    ];

    const doc = renderBulkCorporateCertificatesPdf(sampleOrder, recipients);
    expect(doc.getNumberOfPages()).toBe(2);

    const bytes = bulkCertificatesPdfToBuffer(sampleOrder, recipients);
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('throws if no recipients are provided', () => {
    expect(() => renderBulkCorporateCertificatesPdf(sampleOrder, [])).toThrow(
      'At least one employee recipient is required'
    );
  });
});
