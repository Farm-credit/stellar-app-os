import { z } from 'zod';
import type {
  CertificationProviderAdapter,
  CertificationProject,
  CertificationCredit,
  RenewalDocument,
  ProviderProjectResponse,
  ProviderCreditResponse,
  ProviderRenewalResponse,
} from '../types';

// ---------------------------------------------------------------------------
// Zod schemas for Gold Standard API responses
// ---------------------------------------------------------------------------

export const goldStandardProjectSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  project_type: z.string().optional().nullable(),
  methodology: z.string().optional().nullable(),
  status: z.string(),
  registration_date: z.string().optional().nullable(),
  validation_date: z.string().optional().nullable(),
  crediting_period_start: z.string().optional().nullable(),
  crediting_period_end: z.string().optional().nullable(),
  developer: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  sdg_goals: z.array(z.number()).optional().nullable(),
  estimated_annual_reductions: z.number().optional().nullable(),
  total_credits_issued: z.number().optional().nullable(),
});

export const goldStandardCreditSchema = z.object({
  id: z.string(),
  serial_number: z.string(),
  project_id: z.string(),
  vintage: z.number(),
  quantity: z.number(),
  status: z.string(),
  issuance_date: z.string().optional().nullable(),
  retirement_date: z.string().optional().nullable(),
  beneficiary: z.string().optional().nullable(),
  product: z.string().optional().nullable(),
  registry_url: z.string().optional().nullable(),
});

export const goldStandardRenewalSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  renewal_type: z.string(),
  status: z.string(),
  due_date: z.string().optional().nullable(),
  submitted_date: z.string().optional().nullable(),
  approved_date: z.string().optional().nullable(),
  documents: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string().optional().nullable(),
        url: z.string(),
        uploaded_at: z.string().optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
});

export const goldStandardProjectListSchema = z.object({
  data: z.array(goldStandardProjectSchema),
  total: z.number().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
});

export const goldStandardCreditListSchema = z.object({
  data: z.array(goldStandardCreditSchema),
  total: z.number().optional(),
  page: z.number().optional(),
  page_size: z.number().optional(),
});

export type GoldStandardProjectResponse = z.infer<typeof goldStandardProjectSchema>;
export type GoldStandardCreditResponse = z.infer<typeof goldStandardCreditSchema>;
export type GoldStandardRenewalResponse = z.infer<typeof goldStandardRenewalSchema>;

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

export type CertificationStatus =
  | 'active'
  | 'pending'
  | 'suspended'
  | 'withdrawn'
  | 'retired'
  | 'unknown';

const PROJECT_STATUS_MAP: Record<string, CertificationStatus> = {
  registered: 'active',
  active: 'active',
  certified: 'active',
  'under validation': 'pending',
  'under review': 'pending',
  'pending registration': 'pending',
  'request for registration': 'pending',
  suspended: 'suspended',
  'on hold': 'suspended',
  withdrawn: 'withdrawn',
  cancelled: 'withdrawn',
  rejected: 'withdrawn',
  retired: 'retired',
};

const CREDIT_STATUS_MAP: Record<string, CertificationStatus> = {
  issued: 'active',
  active: 'active',
  available: 'active',
  pending: 'pending',
  'pending issuance': 'pending',
  retired: 'retired',
  cancelled: 'withdrawn',
  withdrawn: 'withdrawn',
  suspended: 'suspended',
};

export function mapProjectStatus(status: string | null | undefined): CertificationStatus {
  if (!status) return 'unknown';
  return PROJECT_STATUS_MAP[status.trim().toLowerCase()] ?? 'unknown';
}

export function mapCreditStatus(status: string | null | undefined): CertificationStatus {
  if (!status) return 'unknown';
  return CREDIT_STATUS_MAP[status.trim().toLowerCase()] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapProject(raw: GoldStandardProjectResponse): CertificationProject {
  return {
    provider: 'gold_standard',
    externalId: raw.id,
    registryId: raw.project_id,
    name: raw.name,
    description: raw.description ?? null,
    country: raw.country ?? null,
    region: raw.region ?? null,
    projectType: raw.project_type ?? null,
    methodology: raw.methodology ?? null,
    status: mapProjectStatus(raw.status),
    rawStatus: raw.status,
    registrationDate: raw.registration_date ?? null,
    validationDate: raw.validation_date ?? null,
    creditingPeriodStart: raw.crediting_period_start ?? null,
    creditingPeriodEnd: raw.crediting_period_end ?? null,
    developer: raw.developer ?? null,
    website: raw.website ?? null,
    sdgGoals: raw.sdg_goals ?? [],
    estimatedAnnualReductions: raw.estimated_annual_reductions ?? null,
    totalCreditsIssued: raw.total_credits_issued ?? null,
    metadata: raw,
  };
}

function mapCredit(raw: GoldStandardCreditResponse): CertificationCredit {
  return {
    provider: 'gold_standard',
    externalId: raw.id,
    serialNumber: raw.serial_number,
    projectExternalId: raw.project_id,
    vintage: raw.vintage,
    quantity: raw.quantity,
    status: mapCreditStatus(raw.status),
    rawStatus: raw.status,
    issuanceDate: raw.issuance_date ?? null,
    retirementDate: raw.retirement_date ?? null,
    beneficiary: raw.beneficiary ?? null,
    product: raw.product ?? null,
    registryUrl: raw.registry_url ?? null,
    metadata: raw,
  };
}

function mapRenewalDocument(
  projectId: string,
  doc: NonNullable<GoldStandardRenewalResponse['documents']>[number],
): RenewalDocument {
  return {
    provider: 'gold_standard',
    externalId: doc.id,
    projectExternalId: projectId,
    name: doc.name,
    documentType: doc.type ?? 'renewal',
    url: doc.url,
    uploadedAt: doc.uploaded_at ?? null,
  };
}

function mapRenewal(raw: GoldStandardRenewalResponse): {
  externalId: string;
  projectExternalId: string;
  renewalType: string;
  status: CertificationStatus;
  rawStatus: string;
  dueDate: string | null;
  submittedDate: string | null;
  approvedDate: string | null;
  documents: RenewalDocument[];
} {
  return {
    externalId: raw.id,
    projectExternalId: raw.project_id,
    renewalType: raw.renewal_type,
    status: mapProjectStatus(raw.status),
    rawStatus: raw.status,
    dueDate: raw.due_date ?? null,
    submittedDate: raw.submitted_date ?? null,
    approvedDate: raw.approved_date ?? null,
    documents: (raw.documents ?? []).map((doc) => mapRenewalDocument(raw.project_id, doc)),
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface GoldStandardClientConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.goldstandard.org/v1';

export class GoldStandardClient implements CertificationProviderAdapter {
  readonly provider = 'gold_standard' as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: GoldStandardClientConfig) {
    if (!config.apiKey) {
      throw new Error('GoldStandardClient requires an apiKey');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Gold Standard API request failed (${response.status} ${response.statusText}) for ${path}`,
      );
    }

    const json = await response.json();
    return schema.parse(json);
  }

  async getProject(projectId: string): Promise<CertificationProject> {
    const raw = await this.request(
      `/projects/${encodeURIComponent(projectId)}`,
      goldStandardProjectSchema,
    );
    return mapProject(raw);
  }

  async listProjects(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }): Promise<CertificationProject[]> {
    const query = new URLSearchParams();
    if (params?.page !== undefined) query.set('page', String(params.page));
    if (params?.pageSize !== undefined) query.set('page_size', String(params.pageSize));
    if (params?.status) query.set('status', params.status);
    const suffix = query.toString() ? `?${query.toString()}` : '';

    const raw = await this.request(`/projects${suffix}`, goldStandardProjectListSchema);
    return raw.data.map(mapProject);
  }

  async getCredit(creditId: string): Promise<CertificationCredit> {
    const raw = await this.request(
      `/credits/${encodeURIComponent(creditId)}`,
      goldStandardCreditSchema,
    );
    return mapCredit(raw);
  }

  async listCredits(params: {
    projectId?: string;
    vintage?: number;
    page?: number;
    pageSize?: number;
  }): Promise<CertificationCredit[]> {
    const query = new URLSearchParams();
    if (params.projectId) query.set('project_id', params.projectId);
    if (params.vintage !== undefined) query.set('vintage', String(params.vintage));
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.pageSize !== undefined) query.set('page_size', String(params.pageSize));
    const suffix = query.toString() ? `?${query.toString()}` : '';

    const raw = await this.request(`/credits${suffix}`, goldStandardCreditListSchema);
    return raw.data.map(mapCredit);
  }

  async verifyCredit(serialNumber: string): Promise<CertificationCredit | null> {
    const query = new URLSearchParams({ serial_number: serialNumber });
    const raw = await this.request(
      `/credits?${query.toString()}`,
      goldStandardCreditListSchema,
    );
    const match = raw.data.find((c) => c.serial_number === serialNumber);
    return match ? mapCredit(match) : null;
  }

  async getRenewal(projectId: string): Promise<ReturnType<typeof mapRenewal> | null> {
    const raw = await this.request(
      `/projects/${encodeURIComponent(projectId)}/renewals`,
      z.union([goldStandardRenewalSchema, z.array(goldStandardRenewalSchema)]),
    );
    const renewal = Array.isArray(raw) ? raw[0] : raw;
    return renewal ? mapRenewal(renewal) : null;
  }

  async getRenewalDocuments(projectId: string): Promise<RenewalDocument[]> {
    const renewal = await this.getRenewal(projectId);
    return renewal?.documents ?? [];
  }
}

export function createGoldStandardClient(config: GoldStandardClientConfig): GoldStandardClient {
  return new GoldStandardClient(config);
}