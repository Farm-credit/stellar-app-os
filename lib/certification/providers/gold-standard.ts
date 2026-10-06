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
const fileSchema = z.object({
  documentId: z.string().min(1),
  category: z.string().min(1),
  title: z.string().min(1),
  reviewStatus: z.string().optional(),
  publishedAt: nullableDate,
  validUntil: nullableDate,
  downloadUrl: z.string().url().nullable().optional(),
});

const projectSchema = z.object({
  project: z.object({
    projectId: z.string().min(1),
    title: z.string().min(1),
    lifecycleStatus: z.string().min(1),
    country: z.string().length(2).nullable().optional(),
    methodology: z
      .object({ code: z.string().min(1), title: z.string().min(1).nullable().optional() })
      .nullable()
      .optional(),
    developer: z.string().min(1).nullable().optional(),
    creditingPeriod: z.object({ start: nullableDate, end: nullableDate }).nullable().optional(),
    credits: z
      .object({
        issued: z.number().nonnegative(),
        available: z.number().nonnegative(),
        retired: z.number().nonnegative(),
      })
      .optional(),
    files: z.array(fileSchema).optional(),
    modifiedAt: nullableDate,
  }),
});

const creditSchema = z.object({
  credit: z.object({
    serial: z.string().min(1),
    project: z.string().min(1),
    state: z.string().min(1),
    vintageYear: z.number().int().min(1900).max(2200).nullable().optional(),
    amount: z.number().positive(),
    unit: z.string().min(1),
    issuanceDate: nullableDate,
    retirementDate: nullableDate,
  }),
});

const renewalSchema = z.object({
  renewal: z.object({
    project: z.string().min(1),
    state: z.string().min(1),
    deadline: nullableDate,
    submittedOn: nullableDate,
    reviewedOn: nullableDate,
    files: z.array(fileSchema).optional(),
  }),
});

function projectStatus(status: string): CertificationProjectStatus {
  const value = status.toLowerCase().replace(/[\s-]+/g, '_');
  if (['design_review', 'validation'].includes(value)) return 'validation';
  if (['certified', 'registered'].includes(value)) return 'registered';
  if (['active', 'issuance'].includes(value)) return 'active';
  if (['on_hold', 'suspended'].includes(value)) return 'suspended';
  if (['completed', 'closed'].includes(value)) return 'completed';
  if (['cancelled', 'canceled', 'withdrawn'].includes(value)) return 'cancelled';
  return 'unknown';
}

function creditStatus(status: string): ProviderCreditStatus {
  const value = status.toLowerCase();
  if (['active', 'available', 'issued'].includes(value)) return 'active';
  if (value === 'retired') return 'retired';
  if (['cancelled', 'canceled', 'invalid'].includes(value)) return 'cancelled';
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

function mapFile(file: z.infer<typeof fileSchema>): CertificationDocument {
  const value = file.reviewStatus?.toLowerCase().replace(/[\s-]+/g, '_');
  const status: CertificationDocument['status'] =
    value === 'required'
      ? 'required'
      : ['submitted', 'under_review'].includes(value ?? '')
        ? 'submitted'
        : ['accepted', 'approved'].includes(value ?? '')
          ? 'accepted'
          : ['rejected', 'changes_requested'].includes(value ?? '')
            ? 'rejected'
            : 'unknown';
  return {
    externalId: file.documentId,
    type: file.category,
    name: file.title,
    status,
    issuedAt: file.publishedAt ?? null,
    expiresAt: file.validUntil ?? null,
    sourceUrl: file.downloadUrl ?? null,
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ProviderResponseError('gold-standard');
  return parsed.data;
}

export class GoldStandardClient implements CertificationProviderAdapter {
  readonly provider = 'gold-standard' as const;

  constructor(private readonly http: ProviderHttpClient) {}

  async getProject(projectId: string): Promise<CertificationProject> {
    const { project } = parse(
      projectSchema,
      await this.http.getJson(`projects/${encodeURIComponent(projectId)}`)
    );
    return {
      provider: 'gold-standard',
      projectId: project.projectId,
      name: project.title,
      status: projectStatus(project.lifecycleStatus),
      countryCode: project.country?.toUpperCase() ?? null,
      methodologyId: project.methodology?.code ?? null,
      methodologyName: project.methodology?.title ?? null,
      proponent: project.developer ?? null,
      creditingPeriodStart: project.creditingPeriod?.start ?? null,
      creditingPeriodEnd: project.creditingPeriod?.end ?? null,
      issuedCredits: project.credits?.issued ?? 0,
      availableCredits: project.credits?.available ?? 0,
      retiredCredits: project.credits?.retired ?? 0,
      documents: (project.files ?? []).map(mapFile),
      providerUpdatedAt: project.modifiedAt ?? null,
      syncedAt: new Date().toISOString(),
    };
  }

  async getCredit(serialNumber: string): Promise<ProviderCredit> {
    const { credit } = parse(
      creditSchema,
      await this.http.getJson(`credits/${encodeURIComponent(serialNumber)}`)
    );
    return {
      provider: 'gold-standard',
      projectId: credit.project,
      serialNumber: credit.serial,
      status: creditStatus(credit.state),
      vintage: credit.vintageYear ?? null,
      quantity: credit.amount,
      unit: credit.unit,
      issuedAt: credit.issuanceDate ?? null,
      retiredAt: credit.retirementDate ?? null,
    };
  }

  async getRenewal(projectId: string): Promise<ProviderRenewal> {
    const { renewal } = parse(
      renewalSchema,
      await this.http.getJson(`projects/${encodeURIComponent(projectId)}/renewal`)
    );
    return {
      provider: 'gold-standard',
      projectId: renewal.project,
      status: renewalStatus(renewal.state),
      dueAt: renewal.deadline ?? null,
      submittedAt: renewal.submittedOn ?? null,
      reviewedAt: renewal.reviewedOn ?? null,
      documents: (renewal.files ?? []).map(mapFile),
    };
  }
}
