import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { mockAdminUsers } from '@/lib/api/mock/adminUsers';
import type {
  AirdropRequest,
  AirdropPreview,
  AirdropResult,
  AirdropRecipient,
} from '@/lib/types/carbon';

// Rate limiting configuration
const RATE_LIMIT_WONDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // per window
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

const requestTimestamps = new Map<string, number[]>();
const blockedUntil = new Map<string, number>();
const violationCount = new Map<string, number>();

function getClientKeys(request: Request): string[] {
  const keys: string[] = [];
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
  if (ip) keys.push(`ip:${ip}`);
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) keys.push(`apiKey:${apiKey}`);
  if (keys.length === 0) keys.push('unknown');
  return keys;
}

function checkRateLimit(key: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const blockedUntilTime = blockedUntil.get(key) ?? 0;

  if (now < blockedUntilTime) {
    return { allowed: false, retryAfter: blockedUntilTime - now };
  }

  const timestamps = (requestTimestamps.get(key) ?? []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    // Calculate how long until the oldest request in the window expires
    const oldestTimestamp = timestamps[0];
    const retryAfter = Math.max(1, oldestTimestamp + RATE_LIMIT_WONDOW_MS - now);
    
    // Apply exponential backoff
    const violations = (violationCount.get(key) ?? 0) + 1;
    violationCount.set(key, violations);
    const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, violations - 1), MAX_BACKOFF_MS);
    blockedUntil.set(key, now + Math.max(retryAfter, backoffMs));

    return { allowed: false, retryAfter: Math.max(retryAfter, backoffMs) };
  }

  // Allow request and record it
  timestamps.push(now);
  requestTimestamps.set(key, timestamps);
  // Reset violation count on successful request
  violationCount.set(key, 0);
  return { allowed: true };
}

function enforceRateLimit(request: Request): NextResponse | null {
  const keys = getClientKeys(request);
  for (const key of keys) {
    const result = checkRateLimit(key);
    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests, please slow down.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(((result.retryAfter ?? 0) / 1000)) } }
      );
    }
  }
  return null;
}

function getEarlySponsors(platformLaunchDate: string): AirdropRecipient[] {
  const launch = new Date(platformLaunchDate);
  const cutoff = new Date(launch);
  cutoff.setMonth(cutoff.getMonth() + 6);

  return mockAdminUsers
    .filter((user) => {
      if (user.status === 'Deleted') return false;
      const joined = new Date(user.joinedAt);
      if (joined < launch || joined > cutoff) return false;
      // must have at least one sponsorship activity (donation or credit purchase)
      return user.activityLog.some(
        (entry) => entry.type === 'donation' || entry.type === 'credit_purchase'
      );
    })
    .map((user) => ({
      userId: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      joinedAt: user.joinedAt,
    }));
}

export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitInspection = enforceRateLimit(request);
  if (rateLimitInspection) {
    return rateLimitInspection;
  }

  const { searchParams } = new URL(request.url);
  const platformLaunchDate = searchParams.get('platformLaunchDate');
  const creditsPerSponsor = Number(searchParams.get('creditsPerSponsor') ?? 0);

  if (!platformLaunchDate || isNaN(new Date(platformLaunchDate).getTime())) {
    return NextResponse.json({ error: 'Invalid or missing platformLaunchDate' }, { status: 400 });
  }

  if (creditsPerSponsor <= 0) {
    return NextResponse.json(
      { error: 'creditsPerSponsor must be greater than zero' },
      { status: 400 }
    );
  }

  const recipients = getEarlySponsors(platformLaunchDate);
  const cutoff = new Date(platformLaunchDate);
  cutoff.setMonth(cutoff.getMonth() + 6);

  const preview: AirdropPreview = {
    recipients,
    totalCredits: recipients.length * creditsPerSponsor,
    cutoffDate: cutoff.toISOString(),
  };

  return NextResponse.json(preview);
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimitInspection = enforceRateLimit(request);
  if (rateLimitInspection) {
    return rateLimitInspection;
  }

  try {
    const body = (await request.json()) as AirdropRequest;
    const { creditsPerSponsor, projectId, platformLaunchDate } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    if (!platformLaunchDate || isNaN(new Date(platformLaunchDate).getTime())) {
      return NextResponse.json({ error: 'Invalid or missing platformLaunchDate' }, { status: 400 });
    }

    if (!creditsPerSponsor || creditsPerSponsor <= 0) {
      return NextResponse.json(
        { error: 'creditsPerSponsor must be greater than zero' },
        { status: 400 }
      );
    }

    const recipients = getEarlySponsors(platformLaunchDate);

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'No eligible sponsors found for the given launch date' },
        { status: 400 }
      );
    }

    // TODO: replace with real Stellar CARBON token transfer per recipient wallet
    const results: AirdropResult = {
      totalQueued: recipients.length,
      recipients: recipients.map((r) => ({
        walletAddress: r.walletAddress,
        status: 'queued' as const,
      })),
    };

    console.info(
      `[airdrop] Admin queued ${results.totalQueued} rerroactive allocations - ` +
        ${creditsPerSponsor} credits each for project ${projectId}
    );

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Airdrop failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
