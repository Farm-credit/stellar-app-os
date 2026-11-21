/**
 * POST /api/alt-text
 *
 * Generates accessible alt text for tree photos using AWS Rekognition.
 *
 * Request body:
 *   { s3Key?: string; imageUrl?: string }
 *   At least one of s3Key or imageUrl must be provided.
 *
 * Response:
 *   { altText: string; confidence: number; labels: string[] }
 *
 * Errors:
 *   400 – invalid / missing input
 *   429 – rate limit exceeded
 *   500 – AWS or internal error
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateAltTextResult } from '@/lib/aws/rekognition';
import { generateAltTextFromUrl } from '@/lib/aws/rekognition';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const requestSchema = z
  .object({
    s3Key: z.string().min(1).optional(),
    imageUrl: z.string().url().optional(),
  })
  .refine((data) => Boolean(data.s3Key) || Boolean(data.imageUrl), {
    message: 'Either s3Key or imageUrl must be provided',
  });

// ---------------------------------------------------------------------------
// In-process rate limiting (per IP, 20 req/min)
// ---------------------------------------------------------------------------

type RateLimitEntry = { timestamps: number[] };
const rateLimitStore = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(ip, entry);
  }

  // Prune old entries
  entry.timestamps = entry.timestamps.filter((ts) => ts > now - WINDOW_MS);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldest);
    return { allowed: false, retryAfterMs };
  }

  entry.timestamps.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rate limiting
  const ip = getClientIp(request);
  const rateLimitResult = checkRateLimit(ip);
  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.ceil(rateLimitResult.retryAfterMs / 1000);
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please retry later.' },
      {
        status: 429,
        headers: { 'Retry-After': retryAfterSeconds.toString() },
      }
    );
  }

  // Parse body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 }
    );
  }

  const { s3Key, imageUrl } = parsed.data;

  try {
    let result: { altText: string; confidence: number; labels: string[] };

    if (s3Key) {
      result = await generateAltTextResult(s3Key);
    } else {
      // imageUrl is guaranteed to be defined by the refine above
      const altText = await generateAltTextFromUrl(imageUrl as string);
      // For URL-based calls we return a minimal result since we don't expose
      // the full result type from generateAltTextFromUrl.
      result = { altText, confidence: 0, labels: [] };
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/alt-text] unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
