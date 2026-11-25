import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { GET as GET_BY_ID } from '../../[id]/route';
import { GET as GET_PDF } from '../../[id]/pdf/route';

describe('Sponsor Receipts API Routes', () => {
  const sampleWallet = 'GACME1111111111111111111111111111111111111111111111111111111';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/sponsor/receipts', () => {
    it('returns receipts list and summary totals with HTTP 200', async () => {
      const req = new NextRequest('http://localhost:3000/api/sponsor/receipts');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.receipts)).toBe(true);
      expect(data.receipts.length).toBeGreaterThan(0);
      expect(data.summary.totalEndowmentsUsd).toBeGreaterThan(0);
      expect(data.summary.totalCo2Tonnes).toBeGreaterThan(0);
      expect(data.summary.totalStewardsFunded).toBeGreaterThan(0);
    });

    it('filters receipts by taxYear', async () => {
      const req = new NextRequest('http://localhost:3000/api/sponsor/receipts?taxYear=2026');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.receipts.every((r: { taxYear: number }) => r.taxYear === 2026)).toBe(true);
    });
  });

  describe('POST /api/sponsor/receipts', () => {
    it('creates an audited receipt with HTTP 201', async () => {
      const req = new NextRequest('http://localhost:3000/api/sponsor/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          benefactorName: 'Terra Carbon Partners',
          walletAddress: sampleWallet,
          amountUsd: 40000,
          taxYear: 2026,
          poolName: 'Global Agroforestry Stewardship Pool',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.receipt).toBeDefined();
      expect(data.receipt.benefactor.organizationName).toBe('Terra Carbon Partners');
      expect(data.receipt.stewards.farmers.sharePercentage).toBe(55);
      expect(data.receipt.stewards.urbanPlanters.sharePercentage).toBe(20);
      expect(data.receipt.stewards.communitySchools.sharePercentage).toBe(15);
      expect(data.receipt.stewards.verifiers.sharePercentage).toBe(10);
      expect(data.receipt.audit.cryptographicDigest).toHaveLength(64);
    });

    it('returns 400 and warns when given invalid Stellar wallet address', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const req = new NextRequest('http://localhost:3000/api/sponsor/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          benefactorName: 'Invalid Wallet Benefactor',
          walletAddress: 'not-a-valid-stellar-key',
          amountUsd: 10000,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain('Validation failed');
      expect(data.details.walletAddress).toBeDefined();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('GET /api/sponsor/receipts/[id]', () => {
    it('retrieves receipt and validates cryptographic digest', async () => {
      const req = new NextRequest('http://localhost:3000/api/sponsor/receipts/rcpt_2026_1819');
      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: 'rcpt_2026_1819' }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.receipt.id).toBe('rcpt_2026_1819');
      expect(data.verification.isDigestValid).toBe(true);
    });

    it('returns 404 for unknown receipt ID', async () => {
      const req = new NextRequest('http://localhost:3000/api/sponsor/receipts/rcpt_unknown');
      const res = await GET_BY_ID(req, { params: Promise.resolve({ id: 'rcpt_unknown' }) });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/sponsor/receipts/[id]/pdf', () => {
    it('returns application/pdf buffer stream for valid receipt', async () => {
      const req = new NextRequest('http://localhost:3000/api/sponsor/receipts/rcpt_2026_1819/pdf');
      const res = await GET_PDF(req, { params: Promise.resolve({ id: 'rcpt_2026_1819' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('attachment; filename=');

      const arrayBuf = await res.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      const header = new TextDecoder().decode(bytes.slice(0, 5));
      expect(header).toBe('%PDF-');
    });
  });
});
