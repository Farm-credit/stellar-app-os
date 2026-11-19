import { NextRequest, NextResponse } from "next/server";
import { MemoryRateLimiter } from "@/lib/rate-limit";

/**
 * Public v1 API authentication and quota middleware.
 *
 * Supports two authentication schemes:
 *  - API key via the `X-API-Key` header (or `Authorization: ApiKey <key>`)
 *  - OAuth2 bearer token via the `Authorization: Bearer <token>` header
 *
 * Resolves the caller's quota tier and enforces per-key/per-client rate limits
 * using the shared MemoryRateLimiter.
 */

export type QuotaTier = "free" | "standard" | "partner" | "internal";

export interface ApiCaller {
  /** Stable identifier for the caller (API key id or OAuth2 client id). */
  id: string;
  /** Authentication scheme used for this request. */
  scheme: "api_key" | "oauth2";
  /** Quota tier resolved for the caller. */
  tier: QuotaTier;
  /** Scopes granted to the caller (OAuth2) or default scopes (API key). */
  scopes: string[];
}

export interface QuotaConfig {
  /** Maximum number of requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const QUOTA_TIERS: Record<QuotaTier, QuotaConfig> = {
  free: { limit: 60, windowMs: 60_000 },
  standard: { limit: 600, windowMs: 60_000 },
  partner: { limit: 6_000, windowMs: 60_000 },
  internal: { limit: 60_000, windowMs: 60_000 },
};

export interface ApiKeyRecord {
  id: string;
  key: string;
  tier: QuotaTier;
  scopes?: string[];
  revoked?: boolean;
}

export interface OAuth2ClientRecord {
  clientId: string;
  /** Accepted bearer tokens mapped to their granted scopes. */
  tokens: Record<string, { scopes: string[]; expiresAt?: number }>;
  tier: QuotaTier;
}

export interface AuthStore {
  findApiKey(key: string): ApiKeyRecord | undefined;
  findOAuth2Token(token: string): { client: OAuth2ClientRecord; scopes: string[] } | undefined;
}

/**
 * In-memory auth store used as a default. In production this should be backed
 * by the database / secrets manager. Kept here so the middleware is usable and
 * testable out of the box.
 */
export class InMemoryAuthStore implements AuthStore {
  private apiKeys = new Map<string, ApiKeyRecord>();
  private oauth2Clients = new Map<string, OAuth2ClientRecord>();

  addApiKey(record: ApiKeyRecord): void {
    this.apiKeys.set(record.key, record);
  }

  addOAuth2Client(client: OAuth2ClientRecord): void {
    this.oauth2Clients.set(client.clientId, client);
  }

  findApiKey(key: string): ApiKeyRecord | undefined {
    const record = this.apiKeys.get(key);
    if (!record || record.revoked) return undefined;
    return record;
  }

  findOAuth2Token(
    token: string
  ): { client: OAuth2ClientRecord; scopes: string[] } | undefined {
    for (const client of this.oauth2Clients.values()) {
      const entry = client.tokens[token];
      if (!entry) continue;
      if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
        return undefined;
      }
      return { client, scopes: entry.scopes };
    }
    return undefined;
  }
}

export const defaultAuthStore = new InMemoryAuthStore();

const limiter = new MemoryRateLimiter();

export interface PublicApiAuthOptions {
  store?: AuthStore;
  /** Override the limiter (useful for tests). */
  limiter?: MemoryRateLimiter;
  /** Required scopes for the wrapped handler. */
  requiredScopes?: string[];
}

export type AuthedHandler = (
  req: NextRequest,
  caller: ApiCaller
) => Promise<Response> | Response;

function unauthorized(message: string, scheme?: string): NextResponse {
  const headers: Record<string, string> = {
    "WWW-Authenticate": scheme ? `${scheme} realm="public-api"` : 'Bearer realm="public-api"',
  };
  return NextResponse.json(
    { error: "unauthorized", message },
    { status: 401, headers }
  );
}

function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: "forbidden", message }, { status: 403 });
}

function extractApiKey(req: NextRequest): string | undefined {
  const headerKey = req.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();

  const auth = req.headers.get("authorization");
  if (auth) {
    const match = /^ApiKey\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractBearerToken(req: NextRequest): string | undefined {
  const auth = req.headers.get("authorization");
  if (!auth) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match ? match[1].trim() : undefined;
}

function resolveCaller(
  req: NextRequest,
  store: AuthStore
): { caller: ApiCaller } | { error: NextResponse } {
  const apiKey = extractApiKey(req);
  if (apiKey) {
    const record = store.findApiKey(apiKey);
    if (!record) {
      return { error: unauthorized("Invalid API key", "ApiKey") };
    }
    return {
      caller: {
        id: record.id,
        scheme: "api_key",
        tier: record.tier,
        scopes: record.scopes ?? ["trees:read", "sponsorships:write"],
      },
    };
  }

  const bearer = extractBearerToken(req);
  if (bearer) {
    const result = store.findOAuth2Token(bearer);
    if (!result) {
      return { error: unauthorized("Invalid or expired OAuth2 token", "Bearer") };
    }
    return {
      caller: {
        id: result.client.clientId,
        scheme: "oauth2",
        tier: result.client.tier,
        scopes: result.scopes,
      },
    };
  }

  return {
    error: unauthorized(
      "Missing credentials. Provide an X-API-Key header or an OAuth2 bearer token."
    ),
  };
}

function hasRequiredScopes(caller: ApiCaller, required: string[]): boolean {
  if (required.length === 0) return true;
  return required.every((scope) => caller.scopes.includes(scope));
}

function rateLimitHeaders(
  limit: number,
  remaining: number,
  resetAt: number
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}

/**
 * Wrap a route handler with public API authentication and quota enforcement.
 */
export function withPublicApiAuth(
  handler: AuthedHandler,
  options: PublicApiAuthOptions = {}
): (req: NextRequest) => Promise<Response> {
  const store = options.store ?? defaultAuthStore;
  const activeLimiter = options.limiter ?? limiter;
  const requiredScopes = options.requiredScopes ?? [];

  return async (req: NextRequest): Promise<Response> => {
    const resolved = resolveCaller(req, store);
    if ("error" in resolved) {
      return resolved.error;
    }
    const { caller } = resolved;

    if (!hasRequiredScopes(caller, requiredScopes)) {
      return forbidden(
        `Missing required scope(s): ${requiredScopes.join(", ")}`
      );
    }

    const quota = QUOTA_TIERS[caller.tier];
    const key = `${caller.scheme}:${caller.id}`;
    const result = activeLimiter.check(key, quota.limit, quota.windowMs);

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.resetAt - Date.now()) / 1000)
      );
      return NextResponse.json(
        {
          error: "rate_limit_exceeded",
          message: "Quota exceeded for your tier. Please retry later.",
          tier: caller.tier,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
            ...rateLimitHeaders(quota.limit, 0, result.resetAt),
          },
        }
      );
    }

    const response = await handler(req, caller);

    const headers = new Headers(response.headers);
    const rlHeaders = rateLimitHeaders(
      quota.limit,
      result.remaining,
      result.resetAt
    );
    for (const [name, value] of Object.entries(rlHeaders)) {
      headers.set(name, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}