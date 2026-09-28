import { createHash } from 'node:crypto';
import { CertificationNotFoundError, ProviderNotConfiguredError } from './errors';
import type { CertificationRepository } from './repository';
import type {
  CertificationProject,
  CertificationProvider,
  CertificationProviderAdapter,
  CertificationRenewal,
  CreditVerification,
  CreditVerificationMismatch,
  CreditVerificationRequest,
  ProviderRenewal,
  RenewalDocument,
} from './types';

const REQUIRED_RENEWAL_DOCUMENTS = [
  { type: 'monitoring-report', name: 'Monitoring report' },
  { type: 'verification-statement', name: 'Verification statement' },
] as const;

function renewalDocumentId(
  provider: CertificationProvider,
  projectId: string,
  dueAt: string | null,
  type: string
): string {
  const cycle = dueAt?.slice(0, 10) ?? 'unscheduled';
  return createHash('sha256')
    .update(`${provider}:${projectId}:${cycle}:${type}`)
    .digest('hex')
    .slice(0, 24);
}

function verificationId(request: CreditVerificationRequest, checkedAt: string): string {
  return createHash('sha256')
    .update(
      `${request.provider}:${request.projectId}:${request.serialNumber}:${request.vintage ?? ''}:${request.quantity ?? ''}:${checkedAt}`
    )
    .digest('hex')
    .slice(0, 24);
}

export class CertificationService {
  private readonly providers: Map<CertificationProvider, CertificationProviderAdapter>;

  constructor(
    providers: Iterable<CertificationProviderAdapter>,
    private readonly repository: CertificationRepository,
    private readonly now: () => Date = () => new Date()
  ) {
    this.providers = new Map(Array.from(providers, (provider) => [provider.provider, provider]));
  }

  async syncProject(
    providerName: CertificationProvider,
    projectId: string
  ): Promise<CertificationProject> {
    const provider = this.getProvider(providerName);
    const project = await provider.getProject(projectId);
    this.assertMatchingProject(providerName, projectId, project.projectId);
    return this.repository.upsertProject(project);
  }

  async getProject(
    provider: CertificationProvider,
    projectId: string
  ): Promise<CertificationProject> {
    const project = await this.repository.getProject(provider, projectId);
    if (!project) throw new CertificationNotFoundError('Certification project');
    return project;
  }

  async verifyCredit(request: CreditVerificationRequest): Promise<CreditVerification> {
    const provider = this.getProvider(request.provider);
    const credit = await provider.getCredit(request.serialNumber);
    const mismatches: CreditVerificationMismatch[] = [];

    if (credit.projectId !== request.projectId) {
      mismatches.push({
        field: 'projectId',
        expected: request.projectId,
        actual: credit.projectId,
      });
    }
    if (request.vintage !== undefined && credit.vintage !== request.vintage) {
      mismatches.push({ field: 'vintage', expected: request.vintage, actual: credit.vintage });
    }
    if (request.quantity !== undefined && credit.quantity !== request.quantity) {
      mismatches.push({ field: 'quantity', expected: request.quantity, actual: credit.quantity });
    }

    const checkedAt = this.now().toISOString();
    const outcome =
      mismatches.length > 0
        ? 'mismatch'
        : credit.status === 'active'
          ? 'verified'
          : 'not_verifiable';
    const verification: CreditVerification = {
      id: verificationId(request, checkedAt),
      provider: request.provider,
      projectId: request.projectId,
      serialNumber: request.serialNumber,
      outcome,
      providerStatus: credit.status,
      mismatches,
      checkedAt,
      credit,
    };

    return this.repository.saveVerification(verification);
  }

  async syncRenewal(
    providerName: CertificationProvider,
    projectId: string
  ): Promise<CertificationRenewal> {
    const provider = this.getProvider(providerName);
    const source = await provider.getRenewal(projectId);
    this.assertMatchingProject(providerName, projectId, source.projectId);
    const existing = await this.repository.getRenewal(providerName, projectId);
    const renewal = this.mergeRenewalDocuments(source, existing);
    return this.repository.upsertRenewal(renewal);
  }

  async getRenewal(
    provider: CertificationProvider,
    projectId: string
  ): Promise<CertificationRenewal> {
    const renewal = await this.repository.getRenewal(provider, projectId);
    if (!renewal) throw new CertificationNotFoundError('Certification renewal');
    return renewal;
  }

  private getProvider(provider: CertificationProvider): CertificationProviderAdapter {
    const adapter = this.providers.get(provider);
    if (!adapter) throw new ProviderNotConfiguredError(provider);
    return adapter;
  }

  private assertMatchingProject(
    provider: CertificationProvider,
    requestedProjectId: string,
    returnedProjectId: string
  ): void {
    if (requestedProjectId !== returnedProjectId) {
      throw new Error(
        `${provider} provider returned project ${returnedProjectId} for request ${requestedProjectId}`
      );
    }
  }

  private mergeRenewalDocuments(
    source: ProviderRenewal,
    existing: CertificationRenewal | null
  ): CertificationRenewal {
    const providerDocuments: RenewalDocument[] = source.documents.map((document) => ({
      ...document,
      generated: false,
      metadata: {},
    }));
    const sourceTypes = new Set(providerDocuments.map((document) => document.type));
    const existingGenerated = new Map(
      (existing?.documents ?? [])
        .filter((document) => document.generated)
        .map((document) => [document.type, document])
    );

    const generated = REQUIRED_RENEWAL_DOCUMENTS.filter(
      (requirement) => !sourceTypes.has(requirement.type)
    ).map((requirement): RenewalDocument => {
      const previous = existingGenerated.get(requirement.type);
      if (previous && previous.metadata.dueAt === (source.dueAt ?? '')) return previous;
      return {
        externalId: renewalDocumentId(
          source.provider,
          source.projectId,
          source.dueAt,
          requirement.type
        ),
        type: requirement.type,
        name: requirement.name,
        status: 'required',
        issuedAt: null,
        expiresAt: source.dueAt,
        sourceUrl: null,
        generated: true,
        metadata: {
          provider: source.provider,
          projectId: source.projectId,
          dueAt: source.dueAt ?? '',
          templateVersion: '1',
        },
      };
    });

    return {
      provider: source.provider,
      projectId: source.projectId,
      status: source.status,
      dueAt: source.dueAt,
      submittedAt: source.submittedAt,
      reviewedAt: source.reviewedAt,
      documents: [...providerDocuments, ...generated],
      syncedAt: this.now().toISOString(),
    };
  }
}
