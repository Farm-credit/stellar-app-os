/**
 * Tests for the offset-verification webhook contract — Issue #1378
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getPool: () => ({ mockedPool: true }) }));
vi.mock('./dispatch', () => ({ dispatchEvent: vi.fn(async () => []) }));

import { dispatchEvent } from './dispatch';
import {
  emitCreditRetired,
  emitCreditVerified,
  emitPriceChanged,
  emitProjectApproved,
  emitProjectStatusChanged,
} from './events';
import {
  OFFSET_VERIFICATION_EVENT_CATALOG,
  OFFSET_VERIFICATION_EVENT_TYPES,
  OffsetVerificationEventError,
  buildCreditRetiredEvent,
  buildCreditVerifiedEvent,
  buildPriceChangedEvent,
  buildProjectApprovedEvent,
  buildProjectStatusChangedEvent,
  isOffsetVerificationEventType,
  parseOffsetVerificationEvent,
  type CreditRetiredInput,
  type CreditVerifiedInput,
  type PriceChangedInput,
  type ProjectApprovedInput,
  type ProjectStatusChangedInput,
} from './offset-verification';
import { WEBHOOK_EVENT_TYPES, type DispatchEventType, type WebhookDeliveryRow } from './types';

const NOW = new Date('2026-09-26T15:00:00.000Z');
const WALLET = 'GUJZDEGXDNCF32EPF3DHODZDOCIS2JHTLGMXGEDN73U55XTPLPFT7V4S';

const CREDIT_VERIFIED_INPUT: CreditVerifiedInput = {
  creditId: 'credit_01HQZK8WJ4',
  assetCode: 'CARBON-PROJ-004-2024',
  projectId: 'PROJ-004',
  projectName: 'Mangrove Restoration - Indonesia',
  quantityTonnes: 12_500,
  vintage: 2024,
  standard: 'Plan Vivo',
  verifier: 'GoldTree Verification',
  registry: 'Plan Vivo Registry',
  verificationReportUrl: 'https://registry.example/reports/1.pdf',
  transactionHash: 'a1b2c3d4e5f6',
  explorerUrl: 'https://stellar.expert/explorer/public/tx/a1b2c3d4e5f6',
};

const PROJECT_APPROVED_INPUT: ProjectApprovedInput = {
  projectId: 'PROJ-011',
  projectName: 'Coastal Blue Carbon - Philippines',
  projectType: 'Mangrove Restoration',
  region: 'southeast-asia',
  standard: 'Verra (VCS)',
  expectedAnnualTonnes: 48_000,
  approvedBy: 'Sustainability Review Board',
  approvalReference: 'APPROVAL-2026-0117',
  transactionHash: 'b2c3d4e5f6a7',
  explorerUrl: 'https://stellar.expert/explorer/public/tx/b2c3d4e5f6a7',
};

const CREDIT_RETIRED_INPUT: CreditRetiredInput = {
  creditId: 'credit_01HQZK8WJ4',
  assetCode: 'CARBON-PROJ-004-2024',
  projectId: 'PROJ-004',
  buyerWallet: WALLET,
  quantityTonnes: 250,
  retirementPurpose: 'FY2026 Scope 3 offset',
  beneficiary: 'Acme Logistics Ltd',
  retirementCertificateUrl: null,
  transactionHash: 'c3d4e5f6a7b8',
  explorerUrl: 'https://stellar.expert/explorer/public/tx/c3d4e5f6a7b8',
};

const PRICE_CHANGED_INPUT: PriceChangedInput = {
  assetCode: 'CARBON-PROJ-004-2024',
  projectId: 'PROJ-004',
  previousPricePerTon: 42.5,
  pricePerTon: 45.1,
  reason: 'Increased registry demand',
  transactionHash: null,
  explorerUrl: null,
};

const STATUS_CHANGED_INPUT: ProjectStatusChangedInput = {
  projectId: 'PROJ-011',
  projectName: 'Coastal Blue Carbon - Philippines',
  previousStatus: 'approved',
  newStatus: 'active',
  note: 'First monitoring period verified.',
  transactionHash: null,
  explorerUrl: null,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('event vocabulary', () => {
  it('registers every offset event with the dispatcher', () => {
    for (const type of OFFSET_VERIFICATION_EVENT_TYPES) {
      expect(WEBHOOK_EVENT_TYPES).toContain(type satisfies DispatchEventType);
    }
  });

  it('guards the type union at runtime', () => {
    expect(isOffsetVerificationEventType('credit.verified')).toBe(true);
    expect(isOffsetVerificationEventType('credit.issued')).toBe(false);
    expect(isOffsetVerificationEventType(42)).toBe(false);
  });
});

describe('buildCreditVerifiedEvent', () => {
  it('normalises the payload and stamps the injected clock', () => {
    const event = buildCreditVerifiedEvent(CREDIT_VERIFIED_INPUT, { now: NOW });

    expect(event.type).toBe('credit.verified');
    expect(event.data.quantityTonnes).toBe(12_500);
    expect(event.data.vintage).toBe(2024);
    expect(event.data.verifiedAt).toBe(NOW.toISOString());
  });

  it('nulls an omitted report url and trims strings', () => {
    const event = buildCreditVerifiedEvent(
      { ...CREDIT_VERIFIED_INPUT, verifier: '  GoldTree  ', verificationReportUrl: '   ' },
      { now: NOW }
    );

    expect(event.data.verifier).toBe('GoldTree');
    expect(event.data.verificationReportUrl).toBeNull();
  });

  it('rejects missing ids, non-positive quantities and malformed urls', () => {
    expect(() => buildCreditVerifiedEvent({ ...CREDIT_VERIFIED_INPUT, projectId: '  ' })).toThrow(
      OffsetVerificationEventError
    );
    expect(() => buildCreditVerifiedEvent({ ...CREDIT_VERIFIED_INPUT, quantityTonnes: 0 })).toThrow(
      /greater than 0/
    );
    expect(() => buildCreditVerifiedEvent({ ...CREDIT_VERIFIED_INPUT, vintage: 1800 })).toThrow(
      /vintage/
    );
    expect(() =>
      buildCreditVerifiedEvent({ ...CREDIT_VERIFIED_INPUT, explorerUrl: 'x'.repeat(3000) })
    ).toThrow(/explorerUrl/);
  });
});

describe('buildProjectApprovedEvent', () => {
  it('builds an approved-project payload', () => {
    const event = buildProjectApprovedEvent(PROJECT_APPROVED_INPUT, { now: NOW });

    expect(event.type).toBe('project.approved');
    expect(event.data.expectedAnnualTonnes).toBe(48_000);
    expect(event.data.approvedAt).toBe(NOW.toISOString());
  });

  it('rejects a non-positive expected yield', () => {
    expect(() =>
      buildProjectApprovedEvent({ ...PROJECT_APPROVED_INPUT, expectedAnnualTonnes: -1 })
    ).toThrow(/greater than 0/);
  });
});

describe('buildCreditRetiredEvent', () => {
  it('accepts a retirement from a Stellar account', () => {
    const event = buildCreditRetiredEvent(CREDIT_RETIRED_INPUT, { now: NOW });

    expect(event.type).toBe('credit.retired');
    expect(event.data.buyerWallet).toBe(WALLET);
    expect(event.data.retirementCertificateUrl).toBeNull();
    expect(event.data.retiredAt).toBe(NOW.toISOString());
  });

  it('rejects a malformed buyer wallet', () => {
    expect(() =>
      buildCreditRetiredEvent({ ...CREDIT_RETIRED_INPUT, buyerWallet: 'not-a-wallet' })
    ).toThrow(/56-character Stellar account/);
  });
});

describe('buildPriceChangedEvent', () => {
  it('derives changePercent and defaults the currency to USD', () => {
    const event = buildPriceChangedEvent(PRICE_CHANGED_INPUT, { now: NOW });

    expect(event.type).toBe('price.changed');
    expect(event.data.currency).toBe('USD');
    expect(event.data.changePercent).toBe(6.12);
    expect(event.data.changedAt).toBe(NOW.toISOString());
  });

  it('handles a price drop', () => {
    const event = buildPriceChangedEvent(
      { ...PRICE_CHANGED_INPUT, previousPricePerTon: 20, pricePerTon: 15 },
      { now: NOW }
    );
    expect(event.data.changePercent).toBe(-25);
  });

  it('rejects a zero or negative previous price', () => {
    expect(() => buildPriceChangedEvent({ ...PRICE_CHANGED_INPUT, previousPricePerTon: 0 })).toThrow(
      /greater than 0/
    );
  });
});

describe('buildProjectStatusChangedEvent', () => {
  it('builds a status transition', () => {
    const event = buildProjectStatusChangedEvent(STATUS_CHANGED_INPUT, { now: NOW });

    expect(event.type).toBe('project.status.changed');
    expect(event.data.previousStatus).toBe('approved');
    expect(event.data.newStatus).toBe('active');
    expect(event.data.changedAt).toBe(NOW.toISOString());
  });

  it('rejects a no-op transition and a blank status', () => {
    expect(() =>
      buildProjectStatusChangedEvent({ ...STATUS_CHANGED_INPUT, newStatus: 'approved' })
    ).toThrow(/must differ/);
    expect(() =>
      buildProjectStatusChangedEvent({ ...STATUS_CHANGED_INPUT, newStatus: '   ' })
    ).toThrow(/newStatus must be a non-empty string/);
  });
});

describe('parseOffsetVerificationEvent', () => {
  it('round-trips every builder output through JSON', () => {
    const events = [
      buildCreditVerifiedEvent(CREDIT_VERIFIED_INPUT, { now: NOW }),
      buildProjectApprovedEvent(PROJECT_APPROVED_INPUT, { now: NOW }),
      buildCreditRetiredEvent(CREDIT_RETIRED_INPUT, { now: NOW }),
      buildPriceChangedEvent(PRICE_CHANGED_INPUT, { now: NOW }),
      buildProjectStatusChangedEvent(STATUS_CHANGED_INPUT, { now: NOW }),
    ];

    for (const event of events) {
      const transported = JSON.parse(JSON.stringify({ type: event.type, data: event.data }));
      expect(parseOffsetVerificationEvent(transported.type, transported.data)).toEqual(event);
    }
  });

  it('narrows to the typed payload', () => {
    const parsed = parseOffsetVerificationEvent('credit.verified', {
      ...CREDIT_VERIFIED_INPUT,
      verifiedAt: NOW.toISOString(),
    });

    if (parsed.type !== 'credit.verified') throw new Error('wrong event type');
    expect(parsed.data.assetCode).toBe('CARBON-PROJ-004-2024');
  });

  it('rejects unknown types and malformed payloads', () => {
    expect(() => parseOffsetVerificationEvent('credit.issued', {})).toThrow(/Unknown/);
    expect(() => parseOffsetVerificationEvent('credit.verified', 'nope')).toThrow(
      /must be a JSON object/
    );
    expect(() =>
      parseOffsetVerificationEvent('credit.verified', { ...CREDIT_VERIFIED_INPUT, creditId: 5 })
    ).toThrow(/creditId must be a non-empty string/);
  });
});

describe('catalog', () => {
  it('documents every offset event exactly once, in lifecycle order', () => {
    expect(OFFSET_VERIFICATION_EVENT_CATALOG.map((entry) => entry.type)).toEqual([
      ...OFFSET_VERIFICATION_EVENT_TYPES,
    ]);
  });

  it('ships required fields and samples that survive validation', () => {
    for (const entry of OFFSET_VERIFICATION_EVENT_CATALOG) {
      expect(entry.requiredFields.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);

      const parsed = parseOffsetVerificationEvent(
        entry.type,
        JSON.parse(JSON.stringify(entry.sample)),
        { now: NOW }
      );
      expect(parsed.type).toBe(entry.type);
    }
  });

  it('never lists a required field as optional', () => {
    for (const entry of OFFSET_VERIFICATION_EVENT_CATALOG) {
      for (const field of entry.requiredFields) {
        expect(entry.optionalFields).not.toContain(field);
      }
    }
  });
});

describe('emitters', () => {
  const rows = [{ id: 1 }] as unknown as WebhookDeliveryRow[];

  it('fans each event out to the dispatcher with its payload', async () => {
    vi.mocked(dispatchEvent).mockResolvedValue(rows);

    const verified = buildCreditVerifiedEvent(CREDIT_VERIFIED_INPUT, { now: NOW });
    await expect(emitCreditVerified(verified.data)).resolves.toBe(rows);

    await emitProjectApproved(buildProjectApprovedEvent(PROJECT_APPROVED_INPUT, { now: NOW }).data);
    await emitCreditRetired(buildCreditRetiredEvent(CREDIT_RETIRED_INPUT, { now: NOW }).data);
    await emitPriceChanged(buildPriceChangedEvent(PRICE_CHANGED_INPUT, { now: NOW }).data);
    await emitProjectStatusChanged(
      buildProjectStatusChangedEvent(STATUS_CHANGED_INPUT, { now: NOW }).data
    );

    expect(vi.mocked(dispatchEvent).mock.calls.map((call) => call[1])).toEqual([
      'credit.verified',
      'project.approved',
      'credit.retired',
      'price.changed',
      'project.status.changed',
    ]);

    // Every emitter reuses the shared pool and passes the payload through.
    const [pool, , payload] = vi.mocked(dispatchEvent).mock.calls[0];
    expect(pool).toEqual({ mockedPool: true });
    expect(payload).toMatchObject({ creditId: 'credit_01HQZK8WJ4' });
  });

  it('never throws when the dispatcher fails', async () => {
    vi.mocked(dispatchEvent).mockRejectedValue(new Error('db down'));

    await expect(
      emitCreditVerified(buildCreditVerifiedEvent(CREDIT_VERIFIED_INPUT, { now: NOW }).data)
    ).resolves.toEqual([]);
    await expect(
      emitProjectStatusChanged(
        buildProjectStatusChangedEvent(STATUS_CHANGED_INPUT, { now: NOW }).data
      )
    ).resolves.toEqual([]);
  });
});
