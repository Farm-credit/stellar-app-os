import { z } from 'zod';
import { ProviderResponseError } from '../errors';
import type { ProviderHttpClient } from '../http-client';
import type {
  CertificationDocument,
  CertificationProject,
  CertificationProjectStatus,
  CertificationProviderAdapter,
  ProviderCredit,
  ProviderCreditStatus,
  ProviderRenewal,
  RenewalStatus,
} from '../types';

export const VERRA_PROVIDER_NAME = 'verra' as const;
export const GOLD_STANDARD_PROVIDER_NAME = 'gold_standard' as const;

const nullableDate = z.string().datetime({ offset: true }).nullable().optional();
const documentSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1),
  status: z.string().optional(),
  issuedAt: nullableDate,
  expiresAt: nullableDate,
  url: z.string().url().nullable().optional(),
});

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.string().min(1),
  countryCode: z.string().length(2).nullable().optional(),
  methodology: z
    .object({ id: z.string().min(1), name: z.string().min(1).nullable().optional() })
    .nullable()
    .optional(),
  proponent: z
    .object({ name: z.string().min(1) })
    .nullable()
    .optional(),
  creditingPeriod: z
    .object({ startDate: nullableDate, endDate: nullableDate })
    .nullable()
    .optional(),
  issuance: z
    .object({
      issued: z.number().nonnegative(),
      available: z.number().nonnegative(),
      retired: z.number().nonnegative(),
    })
    .optional(),
  documents: z.array(documentSchema).optional(),
  updatedAt: nullableDate,
});

const creditSchema = z.object({
  serialNumber: z.string().min(1),
  projectId: z.string().min(1),
  status: z.string().min(1),
  vintage: z.number().int().min(1900).max(2200).nullable().optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  issuedAt: nullableDate,
  retiredAt: nullableDate,
});

const renewalSchema = z.object({
  projectId: z.string().min(1),
  status: z.string().min(1),
  dueAt: nullableDate,
  submittedAt: nullableDate,
  reviewedAt: nullableDate,
  documents: z.array(documentSchema).optional(),
});

function projectStatus(status: string): CertificationProjectStatus {
  const value = status.toLowerCase().replace(/[\s-]+/g, '_');
  if (value.includes('validation')) return 'validation';
  if (value === 'registered') return 'registered';
  if (['active', 'verified'].includes(value)) return 'active';
  if (['suspended', 'on_hold'].includes(value)) return 'suspended';
  if (['completed', 'inactive'].includes(value)) return 'completed';
  if (['cancelled', 'canceled', 'withdrawn'].includes(value)) return 'cancelled';
  return 'unknown';
}

function creditStatus(status: string): ProviderCreditStatus {
  const value = status.toLowerCase();
  if (['active', 'available', 'issued'].includes(value)) return 'active';
  if (value === 'retired') return 'retired';
  if (['cancelled', 'canceled', 'invalidated'].includes(value)) return 'cancelled';
  if (['pending', 'requested'].includes(value)) return 'pending';
  return 'unknown';
}

function renewalStatus(status: string): RenewalStatus {
  const value = status.toLowerCase().replace(/[\s-]+/g, '_');
  if (['not_due', 'current'].includes(value)) return 'not_due';
  if (value === 'due') return 'due';
  if (value === 'overdue') return 'overdue';
  if (['submitted', 'under_review'].includes(value)) return 'submitted';
  if (['accepted', 'approved'].includes(value)) return 'accepted';
  if (['rejected', 'changes_requested'].includes(value)) return 'rejected';
  return 'unknown';
}

function documentStatus(status?: string): CertificationDocument['status'] {
  const value = status?.toLowerCase();
  if (value === 'required') return 'required';
  if (['submitted', 'under_review'].includes(value ?? '')) return 'submitted';
  if (['accepted', 'approved'].includes(value ?? '')) return 'accepted';
  if (['rejected', 'changes_requested'].includes(value ?? '')) return 'rejected';
  return 'unknown';
}

function mapDocument(document: z.infer<typeof documentSchema>): CertificationDocument {
  return {
    externalId: document.id,
    type: document.type,
    name: document.name,
    status: documentStatus(document.status),
    issuedAt: document.issuedAt ?? null,
    expiresAt: document.expiresAt ?? null,
    sourceUrl: document.url ?? null,
  };
}

function validated<T>(
  schema: z.ZodType<T>,
  value: unknown,
  map: (parsed: T) => CertificationProject | ProviderCredit | ProviderRenewal
) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ProviderResponseError('verra');
  return map(parsed.data);
}

export class VerraClient implements CertificationProviderAdapter {
  readonly provider = VERRA_PROVIDER_NAME;

  constructor(private readonly http: ProviderHttpClient) {}

  async getProject(projectId: string): Promise<CertificationProject> {
    const response = await this.http.getJson(`projects/${encodeURIComponent(projectId)}`);
    return validated(projectSchema, response, (project) => ({
      provider: VERRA_PROVIDER_NAME,
      projectId: project.id,
      name: project.name,
      status: projectStatus(project.status),
      countryCode: project.countryCode?.toUpperCase() ?? null,
      methodologyId: project.methodology?.id ?? null,
      methodologyName: project.methodology?.name ?? null,
      proponent: project.proponent?.name ?? null,
      creditingPeriodStart: project.creditingPeriod?.startDate ?? null,
      creditingPeriodEnd: project.creditingPeriod?.endDate ?? null,
      issuedCredits: project.issuance?.issued ?? 0,
      availableCredits: project.issuance?.available ?? 0,
      retiredCredits: project.issuance?.retired ?? 0,
      documents: (project.documents ?? []).map(mapDocument),
      providerUpdatedAt: project.updatedAt ?? null,
      syncedAt: new Date().toISOString(),
    })) as CertificationProject;
  }

  async getCredit(serialNumber: string): Promise<ProviderCredit> {
    const response = await this.http.getJson(`credits/${encodeURIComponent(serialNumber)}`);
    return validated(creditSchema, response, (credit) => ({
      provider: VERRA_PROVIDER_NAME,
      projectId: credit.projectId,
      serialNumber: credit.serialNumber,
      status: creditStatus(credit.status),
      vintage: credit.vintage ?? null,
      quantity: credit.quantity,
      unit: credit.unit,
      issuedAt: credit.issuedAt ?? null,
      retiredAt: credit.retiredAt ?? null,
    })) as ProviderCredit;
  }

  async getRenewal(projectId: string): Promise<ProviderRenewal> {
    const response = await this.http.getJson(`projects/${encodeURIComponent(projectId)}/renewal`);
    return validated(renewalSchema, response, (renewal) => ({
      provider: VERRA_PROVIDER_NAME,
      projectId: renewal.projectId,
      status: renewalStatus(renewal.status),
      dueAt: renewal.dueAt ?? null,
      submittedAt: renewal.submittedAt ?? null,
      reviewedAt: renewal.reviewedAt ?? null,
      documents: (renewal.documents ?? []).map(mapDocument),
    })) as ProviderRenewal;
  }

  async syncStatus(projectId: string): Promise<CertificationProject> {
    return this.getProject(projectId);
  }
}

const gsProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.string().min(1),
  country: z.string().length(2).nullable().optional(),
  methodology: z
    .object({ code: z.string().min(1), title: z.string().min(1).nullable().optional() })
    .nullable()
    .optional(),
  developer: z
    .object({ name: z.string().min(1) })
    .nullable()
    .optional(),
  creditingPeriod: z
    .object({ start: nullableDate, end: nullableDate })
    .nullable()
    .optional(),
  credits: z
    .object({
      issued: z.number().nonnegative(),
      available: z.number().nonnegative(),
      retired: z.number().nonnegative(),
    })
    .optional(),
  documents: z.array(documentSchema).optional(),
  lastUpdated: nullableDate,
});

const gsCreditSchema = z.object({
  serial: z.string().min(1),
  projectId: z.string().min(1),
  state: z.string().min(1),
  vintage: z.number().int().min(1900).max(2200).nullable().optional(),
  amount: z.number().positive(),
  unit: z.string().min(1),
  issuedAt: nullableDate,
  retiredAt: nullableDate,
});

const gsRenewalSchema = z.object({
  projectId: z.string().min(1),
  state: z.string().min(1),
  dueAt: nullableDate,
  submittedAt: nullableDate,
  reviewedAt: nullableDate,
  documents: z.array(documentSchema).optional(),
});

function gsProjectStatus(status: string): CertificationProjectStatus {
  const value = status.toLowerCase().replace(/[\s-]+/g, '_');
  if (value.includes('validation') || value.includes('listing')) return 'validation';
  if (['registered', 'certified'].includes(value)) return 'registered';
  if (['active', 'verified', 'issued'].includes(value)) return 'active';
  if (['suspended', 'on_hold', 'frozen'].includes(value)) return 'suspended';
  if (['completed', 'inactive', 'closed'].includes(value)) return 'completed';
  if (['cancelled', 'canceled', 'withdrawn', 'rejected'].includes(value)) return 'cancelled';
  return 'unknown';
}

function gsCreditStatus(status: string): ProviderCreditStatus {
  const value = status.toLowerCase();
  if (['active', 'available', 'issued'].includes(value)) return 'active';
  if (value === 'retired') return 'retired';
  if (['cancelled', 'canceled', 'invalidated'].includes(value)) return 'cancelled';
  if (['pending', 'requested', 'reserved'].includes(value)) return 'pending';
  return 'unknown';
}

function gsRenewalStatus(status: string): RenewalStatus {
  const value = status.toLowerCase().replace(/[\s-]+/g, '_');
  if (['not_due', 'current'].includes(value)) return 'not_due';
  if (value === 'due') return 'due';
  if (value === 'overdue') return 'overdue';
  if (['submitted', 'under_review', 'in_review'].includes(value)) return 'submitted';
  if (['accepted', 'approved'].includes(value)) return 'accepted';
  if (['rejected', 'changes_requested'].includes(value)) return 'rejected';
  return 'unknown';
}

function gsValidated<T>(
  schema: z.ZodType<T>,
  value: unknown,
  map: (parsed: T) => CertificationProject | ProviderCredit | ProviderRenewal
) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ProviderResponseError(GOLD_STANDARD_PROVIDER_NAME);
  return map(parsed.data);
}

export class GoldStandardClient implements CertificationProviderAdapter {
  readonly provider = GOLD_STANDARD_PROVIDER_NAME;

  constructor(private readonly http: ProviderHttpClient) {}

  async getProject(projectId: string): Promise<CertificationProject> {
    const response = await this.http.getJson(`projects/${encodeURIComponent(projectId)}`);
    return gsValidated(gsProjectSchema, response, (project) => ({
      provider: GOLD_STANDARD_PROVIDER_NAME,
      projectId: project.id,
      name: project.name,
      status: gsProjectStatus(project.status),
      countryCode: project.country?.toUpperCase() ?? null,
      methodologyId: project.methodology?.code ?? null,
      methodologyName: project.methodology?.title ?? null,
      proponent: project.developer?.name ?? null,
      creditingPeriodStart: project.creditingPeriod?.start ?? null,
      creditingPeriodEnd: project.creditingPeriod?.end ?? null,
      issuedCredits: project.credits?.issued ?? 0,
      availableCredits: project.credits?.available ?? 0,
      retiredCredits: project.credits?.retired ?? 0,
      documents: (project.documents ?? []).map(mapDocument),
      providerUpdatedAt: project.lastUpdated ?? null,
      syncedAt: new Date().toISOString(),
    })) as CertificationProject;
  }

  async getCredit(serialNumber: string): Promise<ProviderCredit> {
    const response = await this.http.getJson(`credits/${encodeURIComponent(serialNumber)}`);
    return gsValidated(gsCreditSchema, response, (credit) => ({
      provider: GOLD_STANDARD_PROVIDER_NAME,
      projectId: credit.projectId,
      serialNumber: credit.serial,
      status: gsCreditStatus(credit.state),
      vintage: credit.vintage ?? null,
      quantity: credit.amount,
      unit: credit.unit,
      issuedAt: credit.issuedAt ?? null,
      retiredAt: credit.retiredAt ?? null,
    })) as ProviderCredit;
  }

  async getRenewal(projectId: string): Promise<ProviderRenewal> {
    const response = await this.http.getJson(`projects/${encodeURIComponent(projectId)}/renewal`);
    return gsValidated(gsRenewalSchema, response, (renewal) => ({
      provider: GOLD_STANDARD_PROVIDER_NAME,
      projectId: renewal.projectId,
      status: gsRenewalStatus(renewal.state),
      dueAt: renewal.dueAt ?? null,
      submittedAt: renewal.submittedAt ?? null,
      reviewedAt: renewal.reviewedAt ?? null,
      documents: (renewal.documents ?? []).map(mapDocument),
    })) as ProviderRenewal;
  }

  async syncStatus(projectId: string): Promise<CertificationProject> {
    return this.getProject(projectId);
  }
}
