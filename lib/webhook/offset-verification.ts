/**
 * Offset-verification webhook events — Issue #1378
 *
 * The platform-side contract for the five offset lifecycle notifications that
 * external systems can subscribe to:
 *
 *   credit.verified         a verifier / registry confirmed issued credits
 *   project.approved        a carbon project passed review
 *   credit.retired          a buyer retired credits against an emission
 *   price.changed           a listed series was repriced
 *   project.status.changed  a project moved to a new lifecycle status
 *
 * Builders validate and normalise the payload before it reaches the dispatcher,
 * so a malformed event fails loudly at the call site instead of being signed and
 * POSTed to every subscriber. `parseOffsetVerificationEvent` re-validates a
 * stored/transported payload, which is what a subscriber (or the retry worker
 * reading a webhook_deliveries row) should do.
 *
 * The dispatcher builds the envelope (`{ id, type, createdAt, data }`); these
 * builders produce the typed `data` only.
 *
 * Closes #1378
 */

import type {
  CreditRetiredPayload,
  CreditVerifiedPayload,
  PriceChangedPayload,
  ProjectApprovedPayload,
  ProjectStatusChangedPayload,
} from './types';

// ── Event map ─────────────────────────────────────────────────────────────────

export interface OffsetVerificationEventMap {
  'credit.verified': CreditVerifiedPayload;
  'project.approved': ProjectApprovedPayload;
  'credit.retired': CreditRetiredPayload;
  'price.changed': PriceChangedPayload;
  'project.status.changed': ProjectStatusChangedPayload;
}

export type OffsetVerificationEventType = keyof OffsetVerificationEventMap;

export type OffsetVerificationEvent = {
  [K in OffsetVerificationEventType]: { type: K; data: OffsetVerificationEventMap[K] };
}[OffsetVerificationEventType];

/** Runtime list of the offset events, in lifecycle order. */
export const OFFSET_VERIFICATION_EVENT_TYPES: readonly OffsetVerificationEventType[] = [
  'credit.verified',
  'project.approved',
  'credit.retired',
  'price.changed',
  'project.status.changed',
] as const;

export const OFFSET_VERIFICATION_WEBHOOK_VERSION = 'v1' as const;

/** Raised when an event payload is missing or malformed. */
export class OffsetVerificationEventError extends Error {
  readonly fields: string[];

  constructor(message: string, fields: string[]) {
    super(message);
    this.name = 'OffsetVerificationEventError';
    this.fields = fields;
  }
}

export interface EventBuilderOptions {
  /** Clock for `*At` fields; override for deterministic tests. */
  now?: Date;
}

// ── Field validation ──────────────────────────────────────────────────────────

const STELLAR_ACCOUNT_RE = /^G[A-Z2-7]{55}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireString(
  value: unknown,
  field: string,
  options: { maxLength?: number; pattern?: RegExp } = {}
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OffsetVerificationEventError(`${field} must be a non-empty string`, [field]);
  }
  const trimmed = value.trim();
  if (options.maxLength && trimmed.length > options.maxLength) {
    throw new OffsetVerificationEventError(
      `${field} must be at most ${options.maxLength} characters`,
      [field]
    );
  }
  if (options.pattern && !options.pattern.test(trimmed)) {
    throw new OffsetVerificationEventError(`${field} is malformed`, [field]);
  }
  return trimmed;
}

function optionalString(value: unknown, field: string, maxLength = 500): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new OffsetVerificationEventError(`${field} must be a string or null`, [field]);
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, maxLength);
}

function requireNumber(value: unknown, field: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (typeof value === 'boolean' || value === '' || !Number.isFinite(parsed)) {
    throw new OffsetVerificationEventError(`${field} must be a finite number`, [field]);
  }
  if (parsed < min || parsed > max) {
    throw new OffsetVerificationEventError(`${field} must be between ${min} and ${max}`, [field]);
  }
  return parsed;
}

/** Strictly positive finite number — used for tonnes and prices. */
function requirePositiveNumber(value: unknown, field: string): number {
  // No lower bound here: the message below is clearer than a range error, and
  // `-Infinity` keeps the generic range check out of the way.
  const parsed = requireNumber(value, field, Number.NEGATIVE_INFINITY);
  if (parsed <= 0) {
    throw new OffsetVerificationEventError(`${field} must be greater than 0`, [field]);
  }
  return parsed;
}

function requireStellarAccount(value: unknown, field: string): string {
  const account = requireString(value, field);
  if (!STELLAR_ACCOUNT_RE.test(account)) {
    throw new OffsetVerificationEventError(
      `${field} must be a 56-character Stellar account (G…)`,
      [field]
    );
  }
  return account;
}

function requireIsoDate(value: unknown, field: string, fallback: Date): string {
  if (value === undefined || value === null || value === '') return fallback.toISOString();
  if (typeof value !== 'string') {
    throw new OffsetVerificationEventError(`${field} must be an ISO-8601 timestamp`, [field]);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new OffsetVerificationEventError(`${field} must be an ISO-8601 timestamp`, [field]);
  }
  return parsed.toISOString();
}

function requireInt(value: unknown, field: string, min: number, max: number): number {
  const parsed = requireNumber(value, field, min, max);
  if (!Number.isInteger(parsed)) {
    throw new OffsetVerificationEventError(`${field} must be an integer`, [field]);
  }
  return parsed;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Normalisers (shared by the builders and by `parse`) ───────────────────────

function normalizeCreditVerified(
  raw: Record<string, unknown>,
  now: Date
): CreditVerifiedPayload {
  return {
    creditId: requireString(raw.creditId, 'creditId'),
    assetCode: requireString(raw.assetCode, 'assetCode'),
    projectId: requireString(raw.projectId, 'projectId'),
    projectName: requireString(raw.projectName, 'projectName'),
    quantityTonnes: requirePositiveNumber(raw.quantityTonnes, 'quantityTonnes'),
    vintage: requireInt(raw.vintage, 'vintage', 1990, 2100),
    standard: requireString(raw.standard, 'standard'),
    verifier: requireString(raw.verifier, 'verifier'),
    registry: requireString(raw.registry, 'registry'),
    verificationReportUrl: optionalString(raw.verificationReportUrl, 'verificationReportUrl', 2048),
    transactionHash: requireString(raw.transactionHash, 'transactionHash'),
    explorerUrl: requireString(raw.explorerUrl, 'explorerUrl', { maxLength: 2048 }),
    verifiedAt: requireIsoDate(raw.verifiedAt, 'verifiedAt', now),
  };
}

function normalizeProjectApproved(
  raw: Record<string, unknown>,
  now: Date
): ProjectApprovedPayload {
  return {
    projectId: requireString(raw.projectId, 'projectId'),
    projectName: requireString(raw.projectName, 'projectName'),
    projectType: requireString(raw.projectType, 'projectType'),
    region: requireString(raw.region, 'region'),
    standard: requireString(raw.standard, 'standard'),
    expectedAnnualTonnes: requirePositiveNumber(raw.expectedAnnualTonnes, 'expectedAnnualTonnes'),
    approvedBy: requireString(raw.approvedBy, 'approvedBy'),
    approvalReference: requireString(raw.approvalReference, 'approvalReference'),
    transactionHash: requireString(raw.transactionHash, 'transactionHash'),
    explorerUrl: requireString(raw.explorerUrl, 'explorerUrl', { maxLength: 2048 }),
    approvedAt: requireIsoDate(raw.approvedAt, 'approvedAt', now),
  };
}

function normalizeCreditRetired(raw: Record<string, unknown>, now: Date): CreditRetiredPayload {
  return {
    creditId: requireString(raw.creditId, 'creditId'),
    assetCode: requireString(raw.assetCode, 'assetCode'),
    projectId: requireString(raw.projectId, 'projectId'),
    buyerWallet: requireStellarAccount(raw.buyerWallet, 'buyerWallet'),
    quantityTonnes: requirePositiveNumber(raw.quantityTonnes, 'quantityTonnes'),
    retirementPurpose: optionalString(raw.retirementPurpose, 'retirementPurpose', 500),
    beneficiary: optionalString(raw.beneficiary, 'beneficiary', 200),
    retirementCertificateUrl: optionalString(
      raw.retirementCertificateUrl,
      'retirementCertificateUrl',
      2048
    ),
    transactionHash: requireString(raw.transactionHash, 'transactionHash'),
    explorerUrl: requireString(raw.explorerUrl, 'explorerUrl', { maxLength: 2048 }),
    retiredAt: requireIsoDate(raw.retiredAt, 'retiredAt', now),
  };
}

function normalizePriceChanged(raw: Record<string, unknown>, now: Date): PriceChangedPayload {
  const previousPricePerTon = requirePositiveNumber(
    raw.previousPricePerTon,
    'previousPricePerTon'
  );
  const pricePerTon = requirePositiveNumber(raw.pricePerTon, 'pricePerTon');

  return {
    assetCode: requireString(raw.assetCode, 'assetCode'),
    projectId: requireString(raw.projectId, 'projectId'),
    currency: requireString(raw.currency ?? 'USD', 'currency', { maxLength: 8 }).toUpperCase(),
    previousPricePerTon,
    pricePerTon,
    // Derived rather than trusted: subscribers should never have to recompute it.
    changePercent: round2(((pricePerTon - previousPricePerTon) / previousPricePerTon) * 100),
    reason: optionalString(raw.reason, 'reason', 500),
    transactionHash: optionalString(raw.transactionHash, 'transactionHash', 200),
    explorerUrl: optionalString(raw.explorerUrl, 'explorerUrl', 2048),
    changedAt: requireIsoDate(raw.changedAt, 'changedAt', now),
  };
}

function normalizeProjectStatusChanged(
  raw: Record<string, unknown>,
  now: Date
): ProjectStatusChangedPayload {
  const previousStatus = requireString(raw.previousStatus, 'previousStatus', { maxLength: 60 });
  const newStatus = requireString(raw.newStatus, 'newStatus', { maxLength: 60 });
  if (previousStatus === newStatus) {
    throw new OffsetVerificationEventError(
      'newStatus must differ from previousStatus',
      ['newStatus']
    );
  }

  return {
    projectId: requireString(raw.projectId, 'projectId'),
    projectName: requireString(raw.projectName, 'projectName'),
    previousStatus,
    newStatus,
    note: optionalString(raw.note, 'note', 1000),
    transactionHash: optionalString(raw.transactionHash, 'transactionHash', 200),
    explorerUrl: optionalString(raw.explorerUrl, 'explorerUrl', 2048),
    changedAt: requireIsoDate(raw.changedAt, 'changedAt', now),
  };
}

const NORMALIZERS: {
  [K in OffsetVerificationEventType]: (
    raw: Record<string, unknown>,
    now: Date
  ) => OffsetVerificationEventMap[K];
} = {
  'credit.verified': normalizeCreditVerified,
  'project.approved': normalizeProjectApproved,
  'credit.retired': normalizeCreditRetired,
  'price.changed': normalizePriceChanged,
  'project.status.changed': normalizeProjectStatusChanged,
};

// ── Builders ──────────────────────────────────────────────────────────────────

export type CreditVerifiedInput = Omit<CreditVerifiedPayload, 'verifiedAt'> & {
  verifiedAt?: string;
};
export type ProjectApprovedInput = Omit<ProjectApprovedPayload, 'approvedAt'> & {
  approvedAt?: string;
};
export type CreditRetiredInput = Omit<CreditRetiredPayload, 'retiredAt'> & { retiredAt?: string };
export type PriceChangedInput = Omit<
  PriceChangedPayload,
  'changePercent' | 'changedAt' | 'currency'
> & { currency?: string; changedAt?: string };
export type ProjectStatusChangedInput = Omit<ProjectStatusChangedPayload, 'changedAt'> & {
  changedAt?: string;
};

export function buildCreditVerifiedEvent(
  input: CreditVerifiedInput,
  options: EventBuilderOptions = {}
): { type: 'credit.verified'; data: CreditVerifiedPayload } {
  return {
    type: 'credit.verified',
    data: normalizeCreditVerified(
      {
        creditId: input.creditId,
        assetCode: input.assetCode,
        projectId: input.projectId,
        projectName: input.projectName,
        quantityTonnes: input.quantityTonnes,
        vintage: input.vintage,
        standard: input.standard,
        verifier: input.verifier,
        registry: input.registry,
        verificationReportUrl: input.verificationReportUrl,
        transactionHash: input.transactionHash,
        explorerUrl: input.explorerUrl,
        verifiedAt: input.verifiedAt,
      },
      options.now ?? new Date()
    ),
  };
}

export function buildProjectApprovedEvent(
  input: ProjectApprovedInput,
  options: EventBuilderOptions = {}
): { type: 'project.approved'; data: ProjectApprovedPayload } {
  return {
    type: 'project.approved',
    data: normalizeProjectApproved(
      {
        projectId: input.projectId,
        projectName: input.projectName,
        projectType: input.projectType,
        region: input.region,
        standard: input.standard,
        expectedAnnualTonnes: input.expectedAnnualTonnes,
        approvedBy: input.approvedBy,
        approvalReference: input.approvalReference,
        transactionHash: input.transactionHash,
        explorerUrl: input.explorerUrl,
        approvedAt: input.approvedAt,
      },
      options.now ?? new Date()
    ),
  };
}

export function buildCreditRetiredEvent(
  input: CreditRetiredInput,
  options: EventBuilderOptions = {}
): { type: 'credit.retired'; data: CreditRetiredPayload } {
  return {
    type: 'credit.retired',
    data: normalizeCreditRetired(
      {
        creditId: input.creditId,
        assetCode: input.assetCode,
        projectId: input.projectId,
        buyerWallet: input.buyerWallet,
        quantityTonnes: input.quantityTonnes,
        retirementPurpose: input.retirementPurpose,
        beneficiary: input.beneficiary,
        retirementCertificateUrl: input.retirementCertificateUrl,
        transactionHash: input.transactionHash,
        explorerUrl: input.explorerUrl,
        retiredAt: input.retiredAt,
      },
      options.now ?? new Date()
    ),
  };
}

export function buildPriceChangedEvent(
  input: PriceChangedInput,
  options: EventBuilderOptions = {}
): { type: 'price.changed'; data: PriceChangedPayload } {
  return {
    type: 'price.changed',
    data: normalizePriceChanged(
      {
        assetCode: input.assetCode,
        projectId: input.projectId,
        currency: input.currency,
        previousPricePerTon: input.previousPricePerTon,
        pricePerTon: input.pricePerTon,
        reason: input.reason,
        transactionHash: input.transactionHash,
        explorerUrl: input.explorerUrl,
        changedAt: input.changedAt,
      },
      options.now ?? new Date()
    ),
  };
}

export function buildProjectStatusChangedEvent(
  input: ProjectStatusChangedInput,
  options: EventBuilderOptions = {}
): { type: 'project.status.changed'; data: ProjectStatusChangedPayload } {
  return {
    type: 'project.status.changed',
    data: normalizeProjectStatusChanged(
      {
        projectId: input.projectId,
        projectName: input.projectName,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        note: input.note,
        transactionHash: input.transactionHash,
        explorerUrl: input.explorerUrl,
        changedAt: input.changedAt,
      },
      options.now ?? new Date()
    ),
  };
}

// ── Inbound / stored payload validation ───────────────────────────────────────

/** Whether a string is one of the offset-verification event types. */
export function isOffsetVerificationEventType(
  value: unknown
): value is OffsetVerificationEventType {
  return (
    typeof value === 'string' &&
    (OFFSET_VERIFICATION_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Validate and normalise a payload that arrived over the wire (or was read back
 * from `webhook_deliveries`). Throws `OffsetVerificationEventError` when the type
 * is unknown or any field is malformed.
 */
export function parseOffsetVerificationEvent(
  type: unknown,
  payload: unknown,
  options: EventBuilderOptions = {}
): OffsetVerificationEvent {
  if (!isOffsetVerificationEventType(type)) {
    throw new OffsetVerificationEventError(
      `Unknown offset-verification event type: ${String(type)}`,
      ['type']
    );
  }

  const record = asRecord(payload);
  if (!record) {
    throw new OffsetVerificationEventError('payload must be a JSON object', ['payload']);
  }

  const now = options.now ?? new Date();
  const data = NORMALIZERS[type](record, now) as OffsetVerificationEventMap[typeof type];
  return { type, data } as OffsetVerificationEvent;
}

// ── Subscriber-facing catalog ─────────────────────────────────────────────────

export interface OffsetVerificationEventDescriptor {
  type: OffsetVerificationEventType;
  summary: string;
  requiredFields: string[];
  optionalFields: string[];
  sample: OffsetVerificationEventMap[OffsetVerificationEventType];
}

const SAMPLE_AT = new Date('2026-01-01T00:00:00.000Z');
const SAMPLE_WALLET = 'GUJZDEGXDNCF32EPF3DHODZDOCIS2JHTLGMXGEDN73U55XTPLPFT7V4S';

const CLOCK = { now: SAMPLE_AT } as const;

/**
 * Machine-readable description of every offset-verification event, served by
 * `GET /api/webhooks/events/catalog` so integrators can generate clients instead
 * of reading docs. Samples are produced by the same builders that run in
 * production, so the catalog cannot drift from the wire format.
 */
export const OFFSET_VERIFICATION_EVENT_CATALOG: readonly OffsetVerificationEventDescriptor[] = [
  {
    type: 'credit.verified',
    summary: 'A verifier or registry confirmed issued carbon credits for a project.',
    requiredFields: [
      'creditId',
      'assetCode',
      'projectId',
      'projectName',
      'quantityTonnes',
      'vintage',
      'standard',
      'verifier',
      'registry',
      'transactionHash',
      'explorerUrl',
    ],
    optionalFields: ['verificationReportUrl', 'verifiedAt'],
    sample: buildCreditVerifiedEvent(
      {
        creditId: 'credit_01HQZK8WJ4',
        assetCode: 'CARBON-PROJ-004-2024',
        projectId: 'PROJ-004',
        projectName: 'Mangrove Restoration - Indonesia',
        quantityTonnes: 12_500,
        vintage: 2024,
        standard: 'Plan Vivo',
        verifier: 'GoldTree Verification',
        registry: 'Plan Vivo Registry',
        verificationReportUrl: 'https://registry.example/reports/credit_01HQZK8WJ4.pdf',
        transactionHash: 'a1b2c3d4e5f6',
        explorerUrl: 'https://stellar.expert/explorer/public/tx/a1b2c3d4e5f6',
      },
      CLOCK
    ).data,
  },
  {
    type: 'project.approved',
    summary: 'A carbon project passed review and is eligible to issue credits.',
    requiredFields: [
      'projectId',
      'projectName',
      'projectType',
      'region',
      'standard',
      'expectedAnnualTonnes',
      'approvedBy',
      'approvalReference',
      'transactionHash',
      'explorerUrl',
    ],
    optionalFields: ['approvedAt'],
    sample: buildProjectApprovedEvent(
      {
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
      },
      CLOCK
    ).data,
  },
  {
    type: 'credit.retired',
    summary: 'A buyer retired credits against an emission, with an optional certificate.',
    requiredFields: [
      'creditId',
      'assetCode',
      'projectId',
      'buyerWallet',
      'quantityTonnes',
      'transactionHash',
      'explorerUrl',
    ],
    optionalFields: [
      'retirementPurpose',
      'beneficiary',
      'retirementCertificateUrl',
      'retiredAt',
    ],
    sample: buildCreditRetiredEvent(
      {
        creditId: 'credit_01HQZK8WJ4',
        assetCode: 'CARBON-PROJ-004-2024',
        projectId: 'PROJ-004',
        buyerWallet: SAMPLE_WALLET,
        quantityTonnes: 250,
        retirementPurpose: 'FY2026 Scope 3 offset',
        beneficiary: 'Acme Logistics Ltd',
        retirementCertificateUrl: 'https://app.example/certificates/ret_01HQZK9',
        transactionHash: 'c3d4e5f6a7b8',
        explorerUrl: 'https://stellar.expert/explorer/public/tx/c3d4e5f6a7b8',
      },
      CLOCK
    ).data,
  },
  {
    type: 'price.changed',
    summary: 'A listed credit series was repriced; changePercent is derived by the platform.',
    requiredFields: ['assetCode', 'projectId', 'previousPricePerTon', 'pricePerTon'],
    optionalFields: ['currency', 'reason', 'transactionHash', 'explorerUrl', 'changedAt'],
    sample: buildPriceChangedEvent(
      {
        assetCode: 'CARBON-PROJ-004-2024',
        projectId: 'PROJ-004',
        currency: 'USD',
        previousPricePerTon: 42.5,
        pricePerTon: 45.1,
        reason: 'Increased registry demand',
        transactionHash: null,
        explorerUrl: null,
      },
      CLOCK
    ).data,
  },
  {
    type: 'project.status.changed',
    summary: 'A project moved to a new lifecycle status (e.g. approved → active → suspended).',
    requiredFields: ['projectId', 'projectName', 'previousStatus', 'newStatus'],
    optionalFields: ['note', 'transactionHash', 'explorerUrl', 'changedAt'],
    sample: buildProjectStatusChangedEvent(
      {
        projectId: 'PROJ-011',
        projectName: 'Coastal Blue Carbon - Philippines',
        previousStatus: 'approved',
        newStatus: 'active',
        note: 'First monitoring period verified.',
        transactionHash: null,
        explorerUrl: null,
      },
      CLOCK
    ).data,
  },
];
