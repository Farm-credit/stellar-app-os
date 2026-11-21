import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  enrollCompany,
  getProgramByWallet,
  setProgramStatus,
  runAutoPurchase,
  generateMonthlyReport,
  getCumulativePurchases,
} from '@/lib/corporate-offset';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

const EnrollmentSchema = z.object({
  companyName: z.string().min(2).max(255),
  companyEmail: z.string().email(),
  walletAddress: z.string().min(40).max(80),
  annualTargetTco2e: z.number().positive(),
  autoPurchase: z.boolean().default(true),
  monthlyBudgetCap: z.number().positive().nullable().optional(),
  preferredProjects: z.array(z.string().max(64)).max(20).optional(),
  preferredTypes: z.array(z.string().max(50)).max(10).optional(),
  netZeroPledge: z.boolean().optional(),
  targetYear: z.number().int().min(2026).max(2100).nullable().optional(),
});

const AutoPurchaseSchema = z.object({
  walletAddress: z.string().min(40).max(80),
  inventory: z
    .array(
      z.object({
        projectId: z.string().min(1).max(64),
        quantityTco2e: z.number().positive(),
        unitPrice: z.number().min(0),
        projectType: z.string().max(50).optional(),
        coBenefits: z.array(z.string().max(100)).optional(),
      })
    )
    .max(200),
});

/**
 * POST /api/offset-program — enroll a company (idempotent per wallet) (#1337).
 */
export async function POST(request: Request) {
  try {
    const parsed = EnrollmentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const program = await enrollCompany(parsed.data);
    logger.info('[api:offset-program] company enrolled', { programId: program.id });
    return NextResponse.json({ program }, { status: 201 });
  } catch (error) {
    logger.error('[api:offset-program] enrollment failed', { error });
    const message = error instanceof Error ? error.message : 'Enrollment failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/offset-program?wallet=<addr>            → program + progress
 * GET /api/offset-program?wallet=<addr>&report=1    → monthly report
 */
export async function GET(request: Request) {
  try {
    const wallet = new URL(request.url).searchParams.get('wallet');
    const wantReport = new URL(request.url).searchParams.get('report') === '1';
    const period = new URL(request.url).searchParams.get('period') ?? undefined;

    if (!wallet) {
      return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 });
    }

    const program = await getProgramByWallet(wallet);
    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    const cumulative = await getCumulativePurchases(program.id);
    const pctOfTarget = Math.min((cumulative / program.annualTargetTco2e) * 100, 100);

    if (wantReport) {
      const report = await generateMonthlyReport(wallet, period);
      return NextResponse.json({ program, progress: { cumulative, pctOfTarget }, report });
    }

    return NextResponse.json({
      program,
      progress: {
        cumulative,
        pctOfTarget,
        remaining: Math.max(program.annualTargetTco2e - cumulative, 0),
      },
    });
  } catch (error) {
    logger.error('[api:offset-program] lookup failed', { error });
    const message = error instanceof Error ? error.message : 'Lookup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/offset-program — pause/resume/cancel a program.
 */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { walletAddress?: string; status?: string };
    if (!body.walletAddress || !body.status) {
      return NextResponse.json({ error: 'walletAddress and status are required' }, { status: 400 });
    }
    const allowed = ['active', 'paused', 'cancelled', 'completed'] as const;
    type Status = (typeof allowed)[number];
    if (!allowed.includes(body.status as Status)) {
      return NextResponse.json(
        { error: `status must be one of ${allowed.join(', ')}` },
        { status: 400 }
      );
    }
    const program = await setProgramStatus(body.walletAddress, body.status as Status);
    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }
    return NextResponse.json({ program });
  } catch (error) {
    logger.error('[api:offset-program] status update failed', { error });
    const message = error instanceof Error ? error.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/offset-program — run one automated purchase cycle (#1337).
 * Body: { walletAddress, inventory: [{ projectId, quantityTco2e, unitPrice, ... }] }
 */
export async function PUT(request: Request) {
  try {
    const parsed = AutoPurchaseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { walletAddress, inventory } = parsed.data;
    const run = await runAutoPurchase(walletAddress, inventory);
    return NextResponse.json({ run });
  } catch (error) {
    logger.error('[api:offset-program] auto-purchase failed', { error });
    const message = error instanceof Error ? error.message : 'Auto-purchase failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
