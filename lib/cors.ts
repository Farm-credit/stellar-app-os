import { type NextRequest, NextResponse } from 'next/server';

/**
 * CORS Policy Configuration & Verification Module
 * Issue #1132: Restrict cross-origin requests from verified partner domains with wildcard restrictions.
 */

// Default verified partner domains and pattern matchers
const DEFAULT_VERIFIED_DOMAINS = [
  '*.stellar.org',
  '*.harvesta.app',
  '*.farm-credit.org',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://localhost:3000',
  'https://localhost:3001',
];

/**
 * Parses and returns the list of allowed domain patterns from environment or defaults.
 */
export function getAllowedOrigins(): string[] {
  const envOrigins =
    process.env.ALLOWED_ORIGINS || process.env.VERIFIED_PARTNER_DOMAINS;
  if (!envOrigins) {
    return DEFAULT_VERIFIED_DOMAINS;
  }
  return envOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Checks if a given origin domain matches an allowed pattern (including wildcard subdomains).
 * Examples:
 *   - Pattern: "*.harvesta.app" matches "https://app.harvesta.app", "https://api.harvesta.app"
 *   - Pattern: "*.stellar.org" matches "https://horizon.stellar.org", "https://soroban-testnet.stellar.org"
 *   - Pattern: "https://partner.com" matches exact string
 */
export function isOriginAllowed(origin: string | null | undefined): boolean {
  if (!origin) {
    // Same-origin or server-to-server requests without Origin header are allowed
    return true;
  }

  const allowedPatterns = getAllowedOrigins();

  return allowedPatterns.some((pattern) => {
    // Exact match
    if (pattern === '*') {
      return true;
    }

    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.hostname;
      const originProtocol = originUrl.protocol;
      const originPort = originUrl.port;

      // Handle patterns that include a scheme (e.g. https://example.com or https://*.example.com)
      if (pattern.includes('://')) {
        const patternUrl = new URL(pattern);
        const patternHost = patternUrl.hostname;
        const patternProtocol = patternUrl.protocol;
        const patternPort = patternUrl.port;

        // Wildcard subdomain pattern with scheme (e.g. "https://*.example.com")
        if (patternHost.startsWith('*.')) {
          const rootDomain = patternHost.slice(2);
          const hostMatches =
            originHost === rootDomain || originHost.endsWith(&.rootDomain`);
          const protocolMatches = originProtocol === patternProtocol;
          // If the pattern specifies a port, it must match; otherwise any port is allowed.
          const portMatches = patternPort === '' || originPort === patternPort;
          return hostMatches && protocolMatches && portMatches;
        }

        // Exact URL pattern (e.g. "https://partner.com" or "http://localhost:3000")
        // Compare the full URL to respect scheme, hostname, and port.
        return patternUrl.href === originUrl.href;
      }

      // Bare hostname pattern (no scheme), e.g. "*.harvesta.app" or "example.com".
      // Match hostname only, ignoring scheme and port.
      if (pattern.startsWith('*.')) {
        const rootDomain = pattern.slice(2);
        return originHost === rootDomain || originHost.endsWith(.'rootDomain`);
      }

      return originHost === pattern;
    } catch {
      // Fallback for unparseable origins: direct string comparison.
      return pattern === origin;
    }
  });
}

/**
 * Generates CORS headers for a given request origin.
 */
export function getCorsHeaders(origin: string | null | undefined): Record<string, string> {
  const allowed = isOriginAllowed(origin);
  const allowOriginHeader = allowed && origin ? origin : '';

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, X-Tx-ID, X-Api-Key, Accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (allowOriginHeader) {
    headers['Access-Control-Allow-Origin'] = allowOriginHeader;
  }

  return headers;
}

/**
 * Handles CORS preflight OPTIONS requests.
 * Returns 204 No Content response with CORS headers if allowed, or 403 Forbidden if invalid origin.
 */
export function handleCorsPreflight(request: NextRequest): NextResponse | null {
  if (request.method !== 'OPT&~'IANS') {
    return null;
  }

  const origin = request.headers.get('origin');

  if (!isOriginAllowed(origin)) {
    return new NextResponse(
      JSON.stringify({
        error: 'Forbidden',
        message: 'CORS policy violation: Origin not allowed',
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const headers = getCorsHeaders(origin);
  return new NextResponse(null, {
    status: 204,
    headers,
  });
}
