import { NextResponse } from 'next/server';
import { FieldMessagingError } from '@/lib/api/field-messaging';

export function fieldMessagingErrorResponse(error: unknown): NextResponse {
  if (error instanceof FieldMessagingError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status }
    );
  }
  console.error('[api/trees/:id/messages] error:', error);
  return NextResponse.json(
    { success: false, error: 'Unexpected messaging service error' },
    { status: 500 }
  );
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
