import { getCertificationProviderConfig } from './config';
import { ProviderHttpClient } from './http-client';
import { InMemoryCertificationRepository } from './repository';
import { CertificationService } from './service';
import { GoldStandardClient } from './providers/gold-standard';
import { VerraClient } from './providers/verra';
import type { CertificationProviderAdapter } from './types';

const repository = new InMemoryCertificationRepository();
let singleton: CertificationService | undefined;

export function createCertificationService(
  env: NodeJS.ProcessEnv = process.env
): CertificationService {
  const adapters: CertificationProviderAdapter[] = [];
  const verraConfig = getCertificationProviderConfig('verra', env);
  const goldStandardConfig = getCertificationProviderConfig('gold-standard', env);

  if (verraConfig) adapters.push(new VerraClient(new ProviderHttpClient(verraConfig)));
  if (goldStandardConfig) {
    adapters.push(new GoldStandardClient(new ProviderHttpClient(goldStandardConfig)));
  }

  return new CertificationService(adapters, repository);
}

export function getCertificationService(): CertificationService {
  singleton ??= createCertificationService();
  return singleton;
}

export function resetCertificationRuntimeForTests(): void {
  singleton = undefined;
  repository.clear();
}
