import { NextResponse } from 'next/server';
import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';
import { recordHealthObservation, TreeHealthError } from '@/lib/api/tree-health';
import { getPool } from '@/lib/db/client';
import { addHealthObservation, getTreeHealthSummary } from '@/lib/tree-health/store';

const createObservationSchema = z
  .object({
    heightCm: z
      .number()
      .min(1, 'Height must be greater than 0 cm')
      .max(5000, 'Height is unrealistic'),
    pestPresence: z.enum(['none', 'mild', 'moderate', 'severe']),
    wateringStatus: z.enum(['optimal', 'adequate', 'dry', 'critical']),
    soilMoisturePercent: z.number().int().min(0).max(100).optional(),
    observerName: z.string().trim().min(1, 'Observer name is required').max(100),
    verifierAddress: z
      .string()
      .refine(StrKey.isValidEd25519PublicKey, 'A valid Stellar public key is required')
      .optional(),
    assignedAt: z.string().datetime().optional(),
    decision: z.enum(['approved', 'rejected']).optional(),
    notes: z.string().max(500).optional(),
    observedAt: z.string().datetime().optional(),
  })
  .superRefine((payload, context) => {
    const hasAuditMetadata = Boolean(
      payload.verifierAddress || payload.assignedAt || payload.decision
    );
    if (!hasAuditMetadata) return;

    if (!payload.verifierAddress) {
      context.addIssue({
        code: 'custom',
        path: ['verifierAddress'],
        message: 'Verifier Stellar address is required for an audit.',
      });
    }
    if (!payload.assignedAt) {
      context.addIssue({
        code: 'custom',
        path: ['assignedAt'],
        message: 'Audit start time is required.',
      });
    } else if (Date.parse(payload.assignedAt) > Date.now()) {
      context.addIssue({
        code: 'custom',
        path: ['assignedAt'],
        message: 'Audit start time cannot be in the future.',
      });
    }
    if (!payload.decision) {
      context.addIssue({
        code: 'custom',
        path: ['decision'],
        message: 'Audit decision is required.',
      });
    }
    if (payload.soilMoisturePercent === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['soilMoisturePercent'],
        message: 'Soil moisture is required for a field audit.',
      });
    }
  });

async function postLegacyHealthScore(
  request: Request,
  treeId: string,
  body: Record<string, unknown>
) {
  const fieldTeamToken = process.env.FIELD_TEAM_API_TOKEN;
  if (!fieldTeamToken) {
    return NextResponse.json(
      { error: 'Field health reporting is not configured' },
      { status: 503 }
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${fieldTeamToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await recordHealthObservation({
      treeId,
      score: body.score,
      cause: body.cause,
      remediation: body.remediation,
      note: body.note,
      photoUrls: body.photoUrls,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof TreeHealthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[tree-health] Failed to record legacy health score:', error);
    return NextResponse.json({ error: 'Failed to record health score' }, { status: 500 });
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const summary = getTreeHealthSummary(id);
  return NextResponse.json(summary, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (typeof body === 'object' && body !== null && 'score' in body) {
    return postLegacyHealthScore(request, id, body);
  }

  const parsed = createObservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid health observation payload',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  try {
    const { verifierAddress, assignedAt, decision, soilMoisturePercent, ...observationData } =
      parsed.data;
    let auditId: string | undefined;

    if (verifierAddress && assignedAt && decision && soilMoisturePercent !== undefined) {
      const audit = await getPool().query<{ id: string }>(
        `INSERT INTO verifier_audits
           (tree_id, verifier_address, assigned_at, completed_at, decision,
            soil_moisture_percent, sapling_height_cm, pest_presence)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
         RETURNING id`,
        [
          id,
          verifierAddress,
          assignedAt,
          decision,
          soilMoisturePercent,
          parsed.data.heightCm,
          parsed.data.pestPresence,
        ]
      );
      if (!audit.rows[0]) throw new Error('Verifier audit insert returned no row.');
      auditId = audit.rows[0].id;
    }

    const result = addHealthObservation({
      treeId: id,
      ...observationData,
      soilMoisturePercent,
    });

    return NextResponse.json({ ...result, ...(auditId ? { auditId } : {}) }, { status: 201 });
  } catch (error) {
    console.error('[tree-health] Failed to log health observation:', error);
    return NextResponse.json({ error: 'Failed to log health observation' }, { status: 500 });
  }
}
