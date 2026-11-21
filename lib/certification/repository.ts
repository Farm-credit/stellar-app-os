import type {
  CertificationProject,
  CertificationProvider,
  CertificationRenewal,
  CreditVerification,
} from './types';

export interface CertificationRepository {
  upsertProject(project: CertificationProject): Promise<CertificationProject>;
  getProject(
    provider: CertificationProvider,
    projectId: string
  ): Promise<CertificationProject | null>;
  saveVerification(verification: CreditVerification): Promise<CreditVerification>;
  getVerification(id: string): Promise<CreditVerification | null>;
  upsertRenewal(renewal: CertificationRenewal): Promise<CertificationRenewal>;
  getRenewal(
    provider: CertificationProvider,
    projectId: string
  ): Promise<CertificationRenewal | null>;
}

function key(provider: CertificationProvider, projectId: string): string {
  return `${provider}:${projectId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryCertificationRepository implements CertificationRepository {
  private readonly projects = new Map<string, CertificationProject>();
  private readonly verifications = new Map<string, CreditVerification>();
  private readonly renewals = new Map<string, CertificationRenewal>();

  upsertProject(project: CertificationProject): Promise<CertificationProject> {
    this.projects.set(key(project.provider, project.projectId), clone(project));
    return Promise.resolve(clone(project));
  }

  getProject(
    provider: CertificationProvider,
    projectId: string
  ): Promise<CertificationProject | null> {
    const project = this.projects.get(key(provider, projectId));
    return Promise.resolve(project ? clone(project) : null);
  }

  saveVerification(verification: CreditVerification): Promise<CreditVerification> {
    this.verifications.set(verification.id, clone(verification));
    return Promise.resolve(clone(verification));
  }

  getVerification(id: string): Promise<CreditVerification | null> {
    const verification = this.verifications.get(id);
    return Promise.resolve(verification ? clone(verification) : null);
  }

  upsertRenewal(renewal: CertificationRenewal): Promise<CertificationRenewal> {
    this.renewals.set(key(renewal.provider, renewal.projectId), clone(renewal));
    return Promise.resolve(clone(renewal));
  }

  getRenewal(
    provider: CertificationProvider,
    projectId: string
  ): Promise<CertificationRenewal | null> {
    const renewal = this.renewals.get(key(provider, projectId));
    return Promise.resolve(renewal ? clone(renewal) : null);
  }

  clear(): void {
    this.projects.clear();
    this.verifications.clear();
    this.renewals.clear();
  }
}
