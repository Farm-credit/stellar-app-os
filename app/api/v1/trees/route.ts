import { NextRequest, NextResponse } from 'next/server';
import { MemoryRateLimiter } from '@/lib/rate-limit';

// Shared rate limiter for the public v1 API.
// Keyed by API key / OAuth subject. Adjust limits per plan as needed.
const limiter = new MemoryRateLimiter({
  windowMs: 60_000,
  max: 120,
});

export interface AuthContext {
  subject: string;
  plan: 'free' | 'pro' | 'enterprise';
}

/**
 * Authenticate a request via OAuth2 bearer token or X-API-Key header.
 * Returns the auth context or null when unauthenticated.
 */
export function authenticate(req: NextRequest): AuthContext | null {
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) {
    // In production, validate against a persisted key store.
    if (apiKey.length < 8) return null;
    return { subject: `key:${apiKey}`, plan: 'pro' };
  }

  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    if (token.length < 8) return null;
    return { subject: `oauth:${token}`, plan: 'pro' };
  }

  return null;
}

/**
 * Apply rate limiting for the authenticated subject and build standard
 * rate-limit response headers (RateLimit-* and Retry-After).
 */
export function applyRateLimit(
  ctx: AuthContext,
): { ok: true; headers: Record<string, string> } | { ok: false; headers: Record<string, string> } {
  const result = limiter.check(ctx.subject);
  const resetSeconds = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));
  const headers: Record<string, string> = {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(Math.max(0, result.remaining)),
    'RateLimit-Reset': String(resetSeconds),
  };
  if (!result.allowed) {
    headers['Retry-After'] = String(resetSeconds);
    return { ok: false, headers };
  }
  return { ok: true, headers };
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'unauthorized', message: 'Provide a valid OAuth2 bearer token or X-API-Key header.' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
  );
}

export function rateLimited(headers: Record<string, string>): NextResponse {
  return NextResponse.json(
    { error: 'rate_limited', message: 'Quota exceeded. Retry later.' },
    { status: 429, headers },
  );
}

import { getMockTrees } from '@/lib/api/mock/trees';

export interface PublicTreeRecord {
  id: string;
  treeId: string;
  species: string;
  region: string;
  status: string;
  plantedAt: string;
  latitude: number;
  longitude: number;
  co2OffsetKgPerYear: number;
  projectName: string;
  sponsored: boolean;
  sponsorName: string | null;
  nftTokenId: string | null;
  nftOwner: string | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = authenticate(req);
  if (!ctx) return unauthorized();

  const rl = applyRateLimit(ctx);
  if (!rl.ok) return rateLimited(rl.headers);

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get('per_page') ?? '20', 10) || 20),
  );
  const species = searchParams.get('species');
  const project = searchParams.get('project');
  const sponsoredParam = searchParams.get('sponsored');

  const rawTrees = getMockTrees();
  const allTrees: PublicTreeRecord[] = rawTrees.map((t, index) => {
    const isSponsored = Boolean(t.nftTokenId) || index % 2 === 0;
    return {
      id: t.id,
      treeId: t.treeId,
      species: t.species,
      region: t.region,
      status: t.status,
      plantedAt: t.plantedAt ?? new Date(Date.now() - index * 86400000).toISOString(),
      latitude: t.lat,
      longitude: t.lng,
      co2OffsetKgPerYear: t.co2OffsetKgPerYear,
      projectName: t.projectName,
      sponsored: isSponsored,
      sponsorName: isSponsored ? (t.sponsorName ?? `EcoSponsor ${index + 1}`) : null,
      nftTokenId: t.nftTokenId ?? (isSponsored ? String(index + 1) : null),
      nftOwner: t.nftOwner ?? (isSponsored ? `G${'S'.repeat(54)}${index}` : null),
    };
  });

  let filtered = allTrees;
  if (species) {
    filtered = filtered.filter((t) => t.species.toLowerCase() === species.toLowerCase());
  }
  if (project) {
    filtered = filtered.filter((t) => t.projectName.toLowerCase().includes(project.toLowerCase()));
  }
  if (sponsoredParam === 'true' || sponsoredParam === 'false') {
    const wantSponsored = sponsoredParam === 'true';
    filtered = filtered.filter((t) => t.sponsored === wantSponsored);
  }

  const total = filtered.length;
  const start = (page - 1) * perPage;
  const items = filtered.slice(start, start + perPage);

  return NextResponse.json(
    {
      data: items,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.max(1, Math.ceil(total / perPage)),
      },
    },
    { status: 200, headers: rl.headers },
  );
}