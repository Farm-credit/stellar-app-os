import { NextResponse } from 'next/server';
import {
  createAppreciationId,
  type AppreciationMessage,
  type AppreciationEnvelope,
} from '@/lib/benefactors/appreciation';

export const runtime = 'nodejs';

const messages: AppreciationMessage[] = [];

interface AppreciationRequest {
  benefactorId?: string;
  stewardId?: string;
  milestoneId?: string;
  envelope?: AppreciationEnvelope;
  tipAmount?: string;
  tipAsset?: string;
  transactionHash?: string | null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AppreciationRequest;
    if (!body.benefactorId || !body.stewardId || !body.milestoneId || !body.envelope) {
      return NextResponse.json(
        {
          success: false,
          error: 'Benefactor, steward, milestone, and encrypted note are required.',
        },
        { status: 400 }
      );
    }
    if (body.envelope.version !== 1 || body.envelope.algorithm !== 'AES-GCM') {
      return NextResponse.json(
        { success: false, error: 'Only version 1 AES-GCM appreciation envelopes are supported.' },
        { status: 400 }
      );
    }
    const tipAmount = body.tipAmount ?? '0';
    if (!/^\d+(\.\d{1,7})?$/.test(tipAmount) || Number(tipAmount) < 0) {
      return NextResponse.json(
        { success: false, error: 'Tip amount must be a non-negative decimal.' },
        { status: 400 }
      );
    }

    const message: AppreciationMessage = {
      id: createAppreciationId(),
      benefactorId: body.benefactorId,
      stewardId: body.stewardId,
      milestoneId: body.milestoneId,
      envelope: body.envelope,
      tipAmount,
      tipAsset: body.tipAsset ?? 'CARBON',
      transactionHash: body.transactionHash ?? null,
      createdAt: new Date().toISOString(),
    };
    messages.unshift(message);
    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    console.error('[API /api/benefactors/appreciation] Failed to save encrypted note:', error);
    return NextResponse.json(
      { success: false, error: 'Unable to send appreciation right now.' },
      { status: 500 }
    );
  }
}

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const stewardId = searchParams.get('stewardId');
  const milestoneId = searchParams.get('milestoneId');
  const result = messages.filter(
    (message) =>
      (!stewardId || message.stewardId === stewardId) &&
      (!milestoneId || message.milestoneId === milestoneId)
  );
  return NextResponse.json(
    { success: true, messages: result },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
