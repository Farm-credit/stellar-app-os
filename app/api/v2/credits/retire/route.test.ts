import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, GET } from '@/app/api/v2/credits/retire/route';
import { POST as verifyPOST } from '@/app/api/v2/credits/retire/verify/route';
import { clearBlockchainReceiptsStore } from '@/lib/retirement/receipt';

vi.mock('@/lib/webhook/offset-verification-bridge', () => ({
  notifyCreditRetired: vi.fn().mockResolvedValue(undefined),
}));

describe('/api/v2/credits/retire', () => {
  beforeEach(() => {
    clearBlockchainReceiptsStore();
  });

  it('issues an immutable blockchain receipt with credits retired, project details, co-benefits, and timestamp', async () => {
    const txHash = 'f'.repeat(64);
    const req = new Request('http://localhost/api/v2/credits/retire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerAddress: 'GBUYERWALLET123',
        organizationName: 'GreenTech Inc',
        quantity: 15,
        reason: 'Annual net-zero commitment',
        projectId: 'proj-custom-99',
        projectName: 'Andes Cloud Forest Conservation',
        projectType: 'Reforestation',
        location: 'Cusco, Peru',
        vintageYear: 2025,
        standard: 'Gold Standard',
        coBenefits: ['Biodiversity', 'Water Conservation'],
        transactionHash: txHash,
        network: 'testnet',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.receipt.creditsRetired).toBe(15);
    expect(data.receipt.project.name).toBe('Andes Cloud Forest Conservation');
    expect(data.receipt.project.location).toBe('Cusco, Peru');
    expect(data.receipt.coBenefits).toHaveLength(2);
    expect(data.receipt.timestamp).toBeTruthy();
    expect(data.receipt.isImmutable).toBe(true);

    // Replaying the same transactionHash returns 200 with the exact same immutable receipt
    const replayReq = new Request('http://localhost/api/v2/credits/retire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerAddress: 'GBUYERWALLET123',
        quantity: 999,
        projectId: 'proj-custom-99',
        transactionHash: txHash,
      }),
    });
    const replayRes = await POST(replayReq);
    expect(replayRes.status).toBe(200);
    const replayData = await replayRes.json();
    expect(replayData.idempotent).toBe(true);
    expect(replayData.receipt.creditsRetired).toBe(15);
    expect(replayData.receipt.cryptographicDigest).toBe(data.receipt.cryptographicDigest);
  });

  it('validates required parameters and positive quantity', async () => {
    const missingParams = await POST(
      new Request('http://localhost/api/v2/credits/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 10 }),
      })
    );
    expect(missingParams.status).toBe(400);

    const badQty = await POST(
      new Request('http://localhost/api/v2/credits/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerAddress: 'GBUYER', projectId: 'p1', quantity: -5 }),
      })
    );
    expect(badQty.status).toBe(400);
  });

  it('lists receipts via GET and verifies receipts via POST /verify', async () => {
    const createRes = await POST(
      new Request('http://localhost/api/v2/credits/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerAddress: 'GALICEWALLET',
          quantity: 8,
          projectId: 'proj-verify-1',
          transactionHash: '1'.repeat(64),
        }),
      })
    );
    const { receipt } = await createRes.json();

    const listRes = GET(
      new Request('http://localhost/api/v2/credits/retire?buyer=GALICEWALLET')
    );
    const listData = await listRes.json();
    expect(listData.count).toBe(1);
    expect(listData.receipts[0].receiptId).toBe(receipt.receiptId);

    const verifyRes = await verifyPOST(
      new Request('http://localhost/api/v2/credits/retire/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId: receipt.receiptId }),
      })
    );
    const verifyData = await verifyRes.json();
    expect(verifyData.verified).toBe(true);
    expect(verifyData.creditsRetired).toBe(8);
    expect(verifyData.project.id).toBe('proj-verify-1');
    expect(verifyData.coBenefits.length).toBeGreaterThan(0);
    expect(verifyData.timestamp).toBe(receipt.timestamp);
  });
});
