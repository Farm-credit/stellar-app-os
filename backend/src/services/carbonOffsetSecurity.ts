import { createHash, randomBytes } from 'node:crypto';

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function generateApiKey(): string {
  return `fc_live_${randomBytes(32).toString('base64url')}`;
}

export function isValidAllowedDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase();
  if (!normalized || normalized.includes('://') || normalized.includes('/') || normalized.includes(':')) {
    return false;
  }

  return normalized === 'localhost' ||
    (/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized) && normalized.includes('.'));
}

export function isAllowedOrigin(origin: string | null, allowedDomains: string[]): boolean {
  if (!origin) return false;

  let hostname: string;
  let protocol: string;
  try {
    const parsed = new URL(origin);
    hostname = parsed.hostname.toLowerCase();
    protocol = parsed.protocol;
    if (parsed.origin !== origin) return false;
  } catch {
    return false;
  }

  if (protocol !== 'https:' && !(protocol === 'http:' && hostname === 'localhost')) {
    return false;
  }

  return allowedDomains.some((domain) => {
    const normalized = domain.trim().toLowerCase();
    return hostname === normalized;
  });
}

export function isAllowedRedirectUrl(value: string, allowedDomains: string[]): boolean {
  try {
    const url = new URL(value);
    return !url.username && !url.password && isAllowedOrigin(url.origin, allowedDomains);
  } catch {
    return false;
  }
}