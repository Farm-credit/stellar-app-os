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
  readonly provider = 'verra' as const;

  constructor(private readonly http: ProviderHttpClient) {}

  async getProject(projectId: string): Promise<CertificationProject> {
    const response = await this.http.getJson(`projects/${encodeURIComponent(projectId)}`);
    return validated(projectSchema, response, (project) => ({
      provider: 'verra',
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
      provider: 'verra',
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
      provider: 'verra',
      projectId: renewal.projectId,
      status: renewalStatus(renewal.status),
      dueAt: renewal.dueAt ?? null,
      submittedAt: renewal.submittedAt ?? null,
      reviewedAt: renewal.reviewedAt ?? null,
      documents: (renewal.documents ?? []).map(mapDocument),
    })) as ProviderRenewal;
  }
}
