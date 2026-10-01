/**
 * Tests for the offset-verification webhook bridge — Issue #1316
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ mockedPool: true }) }));
vi.mock('@/lib/webhook/dispatch', () => ({ dispatchEvent: vi.fn(() => Promise.resolve([])) }));

import { dispatchEvent } from '@/lib/webhook/dispatch';
import {
  notifyCreditRetired,
  notifyCreditVerified,
  notifyPriceChanged,
  notifyProjectApproved,
  notifyProjectStatusChanged,
} from '@/lib/webhook/offset-verification-bridge';

const WALLET = 'GUJZDEGXDNCF32EPF3DHODZDOCIS2JHTLGMXGEDN73U55XTPLPFT7V4S';
const mockedDispatch = vi.mocked(dispatchEvent);

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockedDispatch.mockClear();
  mockedDispatch.mockResolvedValue([]);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('notify helpers dispatch the matching event type', () => {
  it('credit.retired', async () => {
    await notifyCreditRetired({
      creditId: 'ret_rcpt_1',
      assetCode: 'CARBON-PROJ-004-2024',
      projectId: 'PROJ-004',
      buyerWallet: WALLET,
      quantityTonnes: 250,
      retirementPurpose: 'FY2026 Scope 3 offset',
      beneficiary: 'Acme Logistics Ltd',
      retirementCertificateUrl: null,
      transactionHash: 'abc123',
      explorerUrl: 'https://stellar.expert/explorer/public/tx/abc123',
    });

    expect(mockedDispatch).toHaveBeenCalledTimes(1);
    const [pool, type, data] = mockedDispatch.mock.calls[0];
    expect(pool).toEqual({ mockedPool: true });
    expect(type).toBe('credit.retired');
    expect(data).toMatchObject({
      creditId: 'ret_rcpt_1',
      buyerWallet: WALLET,
      quantityTonnes: 250,
      beneficiary: 'Acme Logistics Ltd',
    });
  });

  it('credit.verified', async () => {
    await notifyCreditVerified({
      creditId: 'NFT-VCS-1',
      assetCode: 'CARBON-VCS-2024-001-2024',
      projectId: 'VCS-2024-001',
      projectName: 'East Africa Community Reforestation',
      quantityTonnes: 500,
      vintage: 2024,
      standard: 'Verra (VCS)',
      verifier: 'Verra (VCS) Registry',
      registry: 'Verra (VCS)',
      verificationReportUrl: 'https://registry.verra.org/app/projectDetail/VCS/1940',
      transactionHash: '0xdeadbeef',
      explorerUrl: 'https://stellar.expert/explorer/public/tx/0xdeadbeef',
    });

    expect(mockedDispatch.mock.calls[0][1]).toBe('credit.verified');
  });

  it('project.approved', async () => {
    await notifyProjectApproved({
      projectId: 'PROJ-011',
      projectName: 'Coastal Blue Carbon',
      projectType: 'Mangrove Restoration',
      region: 'southeast-asia',
      standard: 'Verra (VCS)',
      expectedAnnualTonnes: 48_000,
      approvedBy: 'Sustainability Review Board',
      approvalReference: 'APPROVAL-2026-0117',
      transactionHash: 'b2c3d4e5f6a7',
      explorerUrl: 'https://stellar.expert/explorer/public/tx/b2c3d4e5f6a7',
    });

    expect(mockedDispatch.mock.calls[0][1]).toBe('project.approved');
  });

  it('project.status.changed', async () => {
    await notifyProjectStatusChanged({
      projectId: 'PROJ-011',
      projectName: 'Coastal Blue Carbon',
      previousStatus: 'approved',
      newStatus: 'active',
      note: 'First monitoring period verified.',
      transactionHash: null,
      explorerUrl: null,
    });

    expect(mockedDispatch.mock.calls[0][1]).toBe('project.status.changed');
  });

  it('price.changed derives the change percent and defaults the currency', async () => {
    await notifyPriceChanged({
      assetCode: 'CARBON-PROJ-004-2024',
      projectId: 'PROJ-004',
      previousPricePerTon: 42.5,
      pricePerTon: 45.1,
      reason: 'Increased registry demand',
      transactionHash: null,
      explorerUrl: null,
    });

    const [, type, data] = mockedDispatch.mock.calls[0];
    expect(type).toBe('price.changed');
    expect(data).toMatchObject({ currency: 'USD', changePercent: 6.12 });
  });
});

describe('failure isolation', () => {
  it('returns the dispatched deliveries', async () => {
    const row = { id: 7, event_type: 'credit.retired' } as never;
    mockedDispatch.mockResolvedValueOnce([row]);

    await expect(
      notifyCreditRetired({
        creditId: 'ret_rcpt_1',
        assetCode: 'CARBON-PROJ-004-2024',
        projectId: 'PROJ-004',
        buyerWallet: WALLET,
        quantityTonnes: 1,
        retirementPurpose: null,
        beneficiary: null,
        retirementCertificateUrl: null,
        transactionHash: 'abc',
        explorerUrl: 'https://example.com/tx/abc',
      })
    ).resolves.toEqual([row]);
  });

  it('drops a payload that fails validation without dispatching', async () => {
    const result = await notifyCreditRetired({
      creditId: 'ret_rcpt_1',
      assetCode: 'CARBON-PROJ-004-2024',
      projectId: 'PROJ-004',
      // Not a 56-character Stellar account.
      buyerWallet: '0xnotastellaraddress',
      quantityTonnes: 1,
      retirementPurpose: null,
      beneficiary: null,
      retirementCertificateUrl: null,
      transactionHash: 'abc',
      explorerUrl: 'https://example.com/tx/abc',
    });

    expect(result).toEqual([]);
    expect(mockedDispatch).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('rejected credit.retired payload'),
      expect.objectContaining({ fields: ['buyerWallet'] })
    );
  });

  it('rejects a status change that does not change the status', async () => {
    const result = await notifyProjectStatusChanged({
      projectId: 'PROJ-011',
      projectName: 'Coastal Blue Carbon',
      previousStatus: 'active',
      newStatus: 'active',
      note: null,
      transactionHash: null,
      explorerUrl: null,
    });

    expect(result).toEqual([]);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });

  it('swallows a dispatcher failure instead of failing the caller', async () => {
    mockedDispatch.mockRejectedValueOnce(new Error('transport down'));

    await expect(
      notifyPriceChanged({
        assetCode: 'CARBON-PROJ-004-2024',
        projectId: 'PROJ-004',
        previousPricePerTon: 42.5,
        pricePerTon: 45.1,
        reason: null,
        transactionHash: null,
        explorerUrl: null,
      })
    ).resolves.toEqual([]);
  });
});
