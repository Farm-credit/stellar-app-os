import { z } from 'zod';
import type { CertificationProvider } from './types';

export interface CertificationProviderConfig {
  provider: CertificationProvider;
  baseUrl: string;
  apiToken?: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
}

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'must use http or https',
  })
  .refine((value) => !new URL(value).username && !new URL(value).password, {
    message: 'must not contain credentials',
  });

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function getCertificationProviderConfig(
  provider: CertificationProvider,
  env: NodeJS.ProcessEnv = process.env
): CertificationProviderConfig | null {
  const prefix = provider === 'verra' ? 'VERRA' : 'GOLD_STANDARD';
  const rawBaseUrl = env[`${prefix}_API_BASE_URL`]?.trim();
  if (!rawBaseUrl) return null;

  const baseUrl = httpUrlSchema.parse(rawBaseUrl).replace(/\/+$/, '');
  const sharedTimeout = env.CERTIFICATION_API_TIMEOUT_MS;
  const sharedRetries = env.CERTIFICATION_API_MAX_RETRIES;
  const sharedRetryDelay = env.CERTIFICATION_API_RETRY_BASE_DELAY_MS;

  return {
    provider,
    baseUrl,
    apiToken: env[`${prefix}_API_TOKEN`]?.trim() || undefined,
    timeoutMs: boundedInteger(
      env[`${prefix}_API_TIMEOUT_MS`] ?? sharedTimeout,
      8_000,
      100,
      120_000
    ),
    maxRetries: boundedInteger(env[`${prefix}_API_MAX_RETRIES`] ?? sharedRetries, 2, 0, 5),
    retryBaseDelayMs: boundedInteger(
      env[`${prefix}_API_RETRY_BASE_DELAY_MS`] ?? sharedRetryDelay,
      200,
      0,
      10_000
    ),
  };
}
