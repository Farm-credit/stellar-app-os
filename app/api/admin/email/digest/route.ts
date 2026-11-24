import { NextResponse } from 'next/server';
import {
  sendWeeklySponsorDigest,
  sendTreeMilestoneEmail,
  type WeeklySponsorDigestParams,
  type TreeMilestoneEmailParams,
} from '@/lib/email/sendgrid';
import { auditLog } from '@/lib/audit';
import { processFarmerPayment, type FarmerPaymentRequest } from '@/lib/payments/farmer';
import { calculateTreeAge, getTreeMilestones, type TreeMilestone } from '@/lib/tree/age';
import { addMilestoneBadge } from '@/lib/tree/badges';
import { getTreeById } from '@/lib/tree/repository';

const SUPPORTED_CURRENCIES = ['XLM', 'USDC', 'FIAT'] as const;
const SUPPORTED_METHODS = ['bank_transfer', 'crypto_wallet', 'payment_app'] as const;

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      digests?: WeeklySponsorDigestParams[];
      payments?: FarmerPaymentRequest[];
      treeId?: string;
      milestones?: TreeMilestoneEmailParams[];
    };
    if (Array.isArray(body.payments)) {
      const results = [];
      for (const payment of body.payments) {
        if (!payment.farmerId || !payment.amount || !payment.currency || !payment.method) {
          await auditLog({
            action: 'ADMIN_FARMER_PAYMENT_INVALID',
            details: { error: 'missing required fields', payment: { farmerId: payment.farmerId } },
          });
          return NextResponse.json(
            { error: 'each payment requires farmerId, amount, currency, and method' },
            { status: 400 }
          );
        }
        if (
          !SUPPORTED_CURRENCIES.includes(payment.currency as (typeof SUPPORTED_CURRENCIES)[number])
        ) {
          await auditLog({
            action: 'ADMIN_FARMER_PAYMENT_INVALID',
            details: { error: 'unsupported currency', currency: payment.currency },
          });
          return NextResponse.json(
            { error: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}` },
            { status: 400 }
          );
        }
        if (!SUPPORTED_METHODS.includes(payment.method as (typeof SUPPORTED_METHODS)[number])) {
          await auditLog({
            action: 'ADMIN_FARMER_PAYMENT_INVALID',
            details: { error: 'unsupported method', method: payment.method },
          });
          return NextResponse.json(
            { error: `method must be one of: ${SUPPORTED_METHODS.join(', ')}` },
            { status: 400 }
          );
        }
        const result = await processFarmerPayment(payment);
        results.push(result);
      }
      await auditLog({
        action: 'ADMIN_FARMER_PAYMENT_SUCCESS',
        details: { count: results.length },
      });
      return NextResponse.json({ processed: results.length, results });
    }
    if (Array.isArray(body.milestones)) {
      const sent: TreeMilestone[] = [];
      for (const milestone of body.milestones) {
        if (!milestone.treeId || !milestone.sponsorEmail || !milestone.sponsorName) {
          await auditLog({
            action: 'ADMIN_TREE_MILESTONE_INVALID',
            details: { error: 'missing required fields', treeId: milestone.treeId },
          });
          return NextResponse.json(
            { error: 'each milestone requires treeId, sponsorEmail, and sponsorName' },
            { status: 400 }
          );
        }
        const tree = await getTreeById(milestone.treeId);
        if (!tree) {
          await auditLog({
            action: 'ADMIN_TREE_MILESTONE_INVALID',
            details: { error: 'tree not found', treeId: milestone.treeId },
          });
          return NextResponse.json(
            { error: `tree not found: ${milestone.treeId}` },
            { status: 404 }
          );
        }
        const age = calculateTreeAge(tree.plantedDate);
        const reached = getTreeMilestones(age);
        const target = milestone.milestone;
        if (!reached.includes(target)) {
          await auditLog({
            action: 'ADMIN_TREE_MILESTONE_INVALID',
            details: {
              error: 'milestone not reached',
              treeId: milestone.treeId,
              milestone: target,
            },
          });
          return NextResponse.json(
            { error: `milestone ${target} not reached for tree ${milestone.treeId}` },
            { status: 400 }
          );
        }
        await sendTreeMilestoneEmail({
          treeId: milestone.treeId,
          treeName: milestone.treeName ?? tree.name,
          sponsorEmail: milestone.sponsorEmail,
          sponsorName: milestone.sponsorName,
          milestone: target,
          ageLabel: age.label,
          plantedDate: tree.plantedDate,
        });
        await addMilestoneBadge(tree, target);
        sent.push(target);
      }
      await auditLog({ action: 'ADMIN_TREE_MILESTONE_SUCCESS', details: { count: sent.length } });
      return NextResponse.json({ sent: sent.length, milestones: sent });
    }
    if (body.treeId) {
      const tree = await getTreeById(body.treeId);
      if (!tree) {
        await auditLog({
          action: 'ADMIN_TREE_AGE_INVALID',
          details: { error: 'tree not found', treeId: body.treeId },
        });
        return NextResponse.json({ error: `tree not found: ${body.treeId}` }, { status: 404 });
      }
      const age = calculateTreeAge(tree.plantedDate);
      const reached = getTreeMilestones(age);
      return NextResponse.json({
        treeId: tree.id,
        age,
        milestones: reached,
        badges: tree.milestoneBadges ?? [],
      });
    }
    if (!Array.isArray(body.digests)) {
      await auditLog({
        action: 'ADMIN_SEND_SPONSOR_DIGEST_INVALID',
        details: { error: 'digests must be an array' },
      });
      return NextResponse.json({ error: 'digests must be an array' }, { status: 400 });
    }
    for (const digest of body.digests) {
      if (!digest.sponsorEmail || !digest.sponsorName || !digest.periodLabel) {
        await auditLog({
          action: 'ADMIN_SEND_SPONSOR_DIGEST_INVALID',
          details: {
            error: 'missing required fields',
            digest: { sponsorEmail: digest.sponsorEmail },
          },
        });
        return NextResponse.json(
          { error: 'each digest requires sponsorEmail, sponsorName, and periodLabel' },
          { status: 400 }
        );
      }
      await sendWeeklySponsorDigest({
        ...digest,
        communityHighlights: digest.communityHighlights ?? [],
        photoUrls: digest.photoUrls ?? [],
      });
    }
    await auditLog({
      action: 'ADMIN_SEND_SPONSOR_DIGEST_SUCCESS',
      details: { count: body.digests.length },
    });
    return NextResponse.json({ queued: body.digests.length, cadence: 'weekly' });
  } catch (error) {
    await auditLog({
      action: 'ADMIN_SEND_SPONSOR_DIGEST_ERROR',
      details: { error: (error as Error).message },
    });
    return NextResponse.json({ error: 'Invalid digest request' }, { status: 400 });
  }
}
