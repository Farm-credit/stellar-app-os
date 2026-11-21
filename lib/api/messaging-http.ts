/**
 * Shared HTTP helpers for the direct-messaging API routes — Issue #1408.
 */

import { NextResponse } from 'next/server';
import { MessagingError } from '@/lib/api/messaging';

/** Maps a thrown domain error to the correct HTTP response. */
export function messagingErrorResponse(error: unknown): NextResponse {
  if (error instanceof MessagingError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { success: false, error: 'Unexpected messaging service error' },
    { status: 500 }
  );
}

/** Reads and parses a JSON body, returning null for malformed payloads. */
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Standard 400 payload for a missing/invalid JSON body. */
export function invalidJsonResponse(): NextResponse {
  return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
}
