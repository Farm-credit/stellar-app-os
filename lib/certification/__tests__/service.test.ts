import { describe, expect, it, vi } from 'vitest';
import { InMemoryCertificationRepository } from '../repository';
import { CertificationService } from '../service';
import type { CertificationProviderAdapter } from '../types';

function provider(
  overrides: Partial<CertificationProviderAdapter> = {}
): CertificationProviderAdapter {
  return {
    provider: 'verra',
    getProject: vi.fn(),
    getCredit: vi.fn().mockResolvedValue({
      provider: 'verra',
      projectId: 'VCS-OTHER',
      serialNumber: 'VCU-100-200',
      status: 'active',
      vintage: 2023,
      quantity: 90,
      unit: 'tCO2e',
      issuedAt: '2024-01-01T00:00:00Z',
      retiredAt: null,
    }),
    getRenewal: vi.fn().mockResolvedValue({
      provider: 'verra',
      projectId: 'VCS-1913',
      status: 'due',
      dueAt: '2027-01-31T00:00:00Z',
      submittedAt: null,
      reviewedAt: null,
      documents: [],
    }),
    ...overrides,
  };
}

describe('CertificationService', () => {
  it('returns explicit mismatches instead of marking the wrong credit verified', async () => {
    const service = new CertificationService(
      [provider()],
      new InMemoryCertificationRepository(),
      () => new Date('2026-09-26T12:00:00Z')
    );

    const result = await service.verifyCredit({
      provider: 'verra',
      projectId: 'VCS-1913',
      serialNumber: 'VCU-100-200',
      vintage: 2024,
      quantity: 100,
    });

    expect(result.outcome).toBe('mismatch');
    expect(result.mismatches).toEqual([
      { field: 'projectId', expected: 'VCS-1913', actual: 'VCS-OTHER' },
      { field: 'vintage', expected: 2024, actual: 2023 },
      { field: 'quantity', expected: 100, actual: 90 },
    ]);
  });

  it('generates stable renewal document metadata idempotently', async () => {
    const adapter = provider();
    const service = new CertificationService(
      [adapter],
      new InMemoryCertificationRepository(),
      () => new Date('2026-09-26T12:00:00Z')
    );

    const first = await service.syncRenewal('verra', 'VCS-1913');
    const second = await service.syncRenewal('verra', 'VCS-1913');

    expect(first.documents).toHaveLength(2);
    expect(first.documents.every((document) => document.generated)).toBe(true);
    expect(second.documents.map((document) => document.externalId)).toEqual(
      first.documents.map((document) => document.externalId)
    );
    expect(second.documents[0].metadata).toEqual({
      provider: 'verra',
      projectId: 'VCS-1913',
      dueAt: '2027-01-31T00:00:00Z',
      templateVersion: '1',
    });
  });

  it('does not generate a duplicate document already supplied by the provider', async () => {
    const adapter = provider({
      getRenewal: vi.fn().mockResolvedValue({
        provider: 'verra',
        projectId: 'VCS-1913',
        status: 'submitted',
        dueAt: '2027-01-31T00:00:00Z',
        submittedAt: '2027-01-01T00:00:00Z',
        reviewedAt: null,
        documents: [
          {
            externalId: 'provider-monitoring-report',
            type: 'monitoring-report',
            name: 'Monitoring report',
            status: 'submitted',
            issuedAt: '2027-01-01T00:00:00Z',
            expiresAt: null,
            sourceUrl: null,
          },
        ],
      }),
    });
    const service = new CertificationService([adapter], new InMemoryCertificationRepository());

    const renewal = await service.syncRenewal('verra', 'VCS-1913');

    expect(
      renewal.documents.filter((document) => document.type === 'monitoring-report')
    ).toHaveLength(1);
    expect(
      renewal.documents.find((document) => document.type === 'monitoring-report')?.generated
    ).toBe(false);
  });
});
