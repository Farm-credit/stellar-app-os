export type CertificationProvider = 'verra' | 'gold-standard';

export interface CertificationSyncRequest {
  projectId: string;
  provider?: CertificationProvider;
  force: boolean;
  requestedBy: string;
}

export interface CertificationSyncResult {
  projectId: string;
  provider?: CertificationProvider;
  syncedAt: string;
}

export const certificationSyncService = {
  syncProject(request: CertificationSyncRequest): Promise<CertificationSyncResult> {
    return Promise.resolve({
      projectId: request.projectId,
      provider: request.provider,
      syncedAt: new Date().toISOString(),
    });
  },
};
