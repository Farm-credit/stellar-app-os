import {
  ProviderHttpError,
  ProviderNetworkError,
  ProviderResponseError,
  ProviderTimeoutError,
} from './errors';
import type { CertificationProviderConfig } from './config';

export type FetchImplementation = typeof fetch;
export type SleepImplementation = (milliseconds: number) => Promise<void>;

const defaultSleep: SleepImplementation = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export class ProviderHttpClient {
  constructor(
    private readonly config: CertificationProviderConfig,
    private readonly fetchImplementation: FetchImplementation = fetch,
    private readonly sleep: SleepImplementation = defaultSleep
  ) {}

  async getJson(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const base = `${this.config.baseUrl}/`;
    const url = new URL(path.replace(/^\/+/, ''), base);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await this.fetchImplementation(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            ...(this.config.apiToken ? { Authorization: `Bearer ${this.config.apiToken}` } : {}),
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const retryable = isRetryableStatus(response.status);
          if (retryable && attempt < this.config.maxRetries) {
            await this.backoff(attempt);
            continue;
          }
          throw new ProviderHttpError(this.config.provider, response.status, retryable);
        }

        try {
          return await response.json();
        } catch {
          throw new ProviderResponseError(this.config.provider);
        }
      } catch (error) {
        if (error instanceof ProviderHttpError || error instanceof ProviderResponseError)
          throw error;
        if (attempt < this.config.maxRetries) {
          await this.backoff(attempt);
          continue;
        }
        if (isAbortError(error)) throw new ProviderTimeoutError(this.config.provider);
        throw new ProviderNetworkError(this.config.provider);
      } finally {
        clearTimeout(timer);
      }
    }

    throw new ProviderNetworkError(this.config.provider);
  }

  private backoff(attempt: number): Promise<void> {
    return this.sleep(this.config.retryBaseDelayMs * 2 ** attempt);
  }
}
