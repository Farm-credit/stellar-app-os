import type { CertificationProvider } from './types';

export class CertificationIntegrationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ProviderNotConfiguredError extends CertificationIntegrationError {
  constructor(provider: CertificationProvider) {
    super(`${provider} certification provider is not configured`, 'PROVIDER_NOT_CONFIGURED', 503);
  }
}

export class ProviderHttpError extends CertificationIntegrationError {
  constructor(
    provider: CertificationProvider,
    upstreamStatus: number,
    readonly retryable: boolean
  ) {
    super(
      `${provider} certification provider returned HTTP ${upstreamStatus}`,
      'PROVIDER_HTTP_ERROR',
      502
    );
  }
}

export class ProviderTimeoutError extends CertificationIntegrationError {
  constructor(provider: CertificationProvider) {
    super(`${provider} certification provider request timed out`, 'PROVIDER_TIMEOUT', 504);
  }
}

export class ProviderNetworkError extends CertificationIntegrationError {
  constructor(provider: CertificationProvider) {
    super(`${provider} certification provider could not be reached`, 'PROVIDER_NETWORK_ERROR', 502);
  }
}

export class ProviderResponseError extends CertificationIntegrationError {
  constructor(provider: CertificationProvider) {
    super(
      `${provider} certification provider returned an invalid response`,
      'PROVIDER_INVALID_RESPONSE',
      502
    );
  }
}

export class CertificationNotFoundError extends CertificationIntegrationError {
  constructor(resource: string) {
    super(`${resource} was not found`, 'CERTIFICATION_NOT_FOUND', 404);
  }
}
