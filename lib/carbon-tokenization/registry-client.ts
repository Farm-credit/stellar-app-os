import { createHash } from 'node:crypto';
import type { ProviderHttpClient } from '../certification/http-client';
import {
  ProviderHttpError,
  ProviderNetworkError,
  ProviderResponseError,
  ProviderTimeoutError,
} from '../certification/errors';
import type {
  CertificationProviderAdapter,
  CertificationProject,
  ProviderCredit,
  RegistryClient,
  RegistryProjectData,
  RegistryProtocol,
  RegistryRetirementData,
} from '../certification/types';

function projectVintage(project: CertificationProject): number | null {
  if (project.creditingPeriodStart) {
    const year = new Date(project.creditingPeriodStart).getUTCFullYear();
    if (!Number.isNaN(year)) return year;
  }
  return null;
}

export function projectToRegistryData(
  project: CertificationProject
): RegistryProjectData {
  return {
    projectId: project.projectId,
    projectName: project.name,
    projectStatus: project.status,
    vintage: projectVintage(project),
    totalTonnage: project.issuedCredits,
    protocol: project.provider,
    countryCode: project.countryCode,
    methodologyId: project.methodologyId,
    proponent: project.proponent,
    creditingPeriodStart: project.creditingPeriodStart,
    creditingPeriodEnd: project.creditingPeriodEnd,
    providerUpdatedAt: project.providerUpdatedAt,
  };
}

export function creditToRegistryRetirement(
  credit: ProviderCredit
): RegistryRetirementData {
  return {
    serialNumber: credit.serialNumber,
    projectId: credit.projectId,
    vintage: credit.vintage,
    tonnage: credit.quantity,
    retiredAt: credit.retiredAt,
    retirementStatus: credit.status,
    protocol: credit.provider,
    retirementNote: null,
    beneficiary: null,
  };
}

function makeValidationId(
  protocol: RegistryProtocol,
  projectId: string,
  serialNumber: string,
  at: string
): string {
  return createHash('sha256')
    .update(`${protocol}:${projectId}:${serialNumber}:${at}`)
    .digest('hex')
    .slice(0, 24);
}

export function makeTokenId(
  protocol: RegistryProtocol,
  serialNumber: string
): string {
  return createHash('sha256')
    .update(`${protocol}:${serialNumber}`)
    .digest('hex');
}

export function makeMintRecordId(
  tokenId: string,
  network: 'testnet' | 'mainnet'
): string {
  return createHash('sha256')
    .update(`${network}:${tokenId}`)
    .digest('hex')
    .slice(0, 24);
}

export { makeValidationId };

export abstract class AbstractRegistryClient implements RegistryClient {
  abstract readonly protocol: RegistryProtocol;

  protected constructor(
    protected readonly adapter: CertificationProviderAdapter,
    protected readonly http: ProviderHttpClient
  ) {}

  async fetchProject(projectId: string): Promise<RegistryProjectData> {
    const project = await this.adapter.getProject(projectId);
    return projectToRegistryData(project);
  }

  async fetchRetirement(serialNumber: string): Promise<RegistryRetirementData> {
    const credit = await this.adapter.getCredit(serialNumber);
    return creditToRegistryRetirement(credit);
  }

  async listProjectRetirements(
    projectId: string
  ): Promise<RegistryRetirementData[]> {
    try {
      const response = await this.http.getJson(
        `projects/${encodeURIComponent(projectId)}/retirements`,
        {}
      );
      const items = Array.isArray(response) ? response : [];
      const results: RegistryRetirementData[] = [];
      for (const item of items) {
        try {
          const credit = await this.adapter.getCredit(
            (item as { serialNumber?: string; serial?: string }).serialNumber ??
              (item as { serialNumber?: string; serial?: string }).serial ??
              ''
          );
          results.push(creditToRegistryRetirement(credit));
        } catch {
          continue;
        }
      }
      return results;
    } catch (error) {
      if (
        error instanceof ProviderHttpError ||
        error instanceof ProviderNetworkError ||
        error instanceof ProviderResponseError ||
        error instanceof ProviderTimeoutError
      ) {
        return [];
      }
      throw error;
    }
  }
}
