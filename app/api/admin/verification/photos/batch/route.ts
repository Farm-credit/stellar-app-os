import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { isAdminRequest } from '@/lib/auth/admin';
import { emitTreeWebhookEvent } from '@/lib/webhook/events';

interface BatchPaymentRequest {
  paymentIds: number[];
  action: 'process' | 'cancel';
  currency?: 'XLM' | 'USDC' | 'FIAT';
  paymentMethod?: 'bank' | 'wallet' | 'payment_app';
  reason?: string;
  resolveConflicts?: 'keep_newest' | 'keep_oldest' | 'manual';
}

interface ConflictResolution {
  paymentId: number;
  farmerRef: string;
  conflictType: 'duplicate' | 'status_mismatch';
  resolution: string;
}

export async function POST(request: Request) {
  const isAdmin = await isAdminRequest();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: BatchPaymentRequest = await request.json();
    const { paymentIds, action, currency, paymentMethod, reason, resolveConflicts = 'keep_newest' } = body;

    if (!paymentIds || paymentIds.length === 0) {
      return NextResponse.json({ error: 'No payment IDs provided' }, { status: 400 });
    }

    if (!['process', 'cancel'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be process or cancel' },
        { status: 400 }
      );
    }

    if (currency && !['XLM', 'USDC', 'FIAT'].includes(currency)) {
      return NextResponse.json({ error: 'Unsupported currency' }, { status: 400 });
    }

    if (paymentMethod && !['bank', 'wallet', 'payment_app'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'Unsupported payment method' }, { status: 400 });
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get payment details and check for conflicts
      const paymentsQuery = `
        SELECT 
          fp.id,
          fp.farmer_id,
          f.farmer_ref,
          f.status,
          fp.duplicate_of,
          fp.reference_hash,
          fp.currency,
          fp.payment_method,
          fp.amount,
          fp.created_at
        FROM farmer_payments fp
        INNER JOIN farmers f ON fp.farmer_id = f.id
        LEFT JOIN payment_hashes ph ON ph.entity_type = 'farmer' 
          AND ph.entity_id = f.farmer_ref
        WHERE fp.id = ANY($1::bigint[])
          AND f.deleted_at IS NULL
        ORDER BY fp.created_at DESC
      `;

      const paymentsResult = await client.query(paymentsQuery, [paymentIds]);
      const payments = paymentsResult.rows;

      if (payments.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'No valid payments found' }, { status: 404 });
      }

      // Check for conflicts
      const conflicts: ConflictResolution[] = [];
      const paymentsToProcess: number[] = [];

      // Group payments by farmer for conflict detection
      const paymentsByFarmer = payments.reduce((acc: Record<string, typeof payments>, payment) => {
        if (!acc[payment.farmer_ref]) {
          acc[payment.farmer_ref] = [];
        }
        acc[payment.farmer_ref].push(payment);
        return acc;
      }, {});

      // Resolve conflicts for farmers with multiple payments
      for (const [farmerRef, farmerPayments] of Object.entries(paymentsByFarmer)) {
        if (farmerPayments.length > 1) {
          // Multiple payments for same farmer - apply conflict resolution
          let selectedPayment;

          if (resolveConflicts === 'keep_newest') {
            selectedPayment = farmerPayments[0]; // Already sorted by created_at DESC
          } else if (resolveConflicts === 'keep_oldest') {
            selectedPayment = farmerPayments[farmerPayments.length - 1];
          } else {
            // Manual resolution required
            conflicts.push({
              paymentId: farmerPayments[0].id,
              farmerRef,
              conflictType: 'duplicate',
              resolution: 'manual_required',
            });
            continue;
          }

          paymentsToProcess.push(selectedPayment.id);

          // Mark others as conflicted
          const rejectedPayments = farmerPayments.filter((p) => p.id !== selectedPayment.id);
          for (const payment of rejectedPayments) {
            conflicts.push({
              paymentId: payment.id,
              farmerRef,
              conflictType: 'duplicate',
              resolution: `rejected_in_favor_of_${selectedPayment.id}`,
            });
          }
        } else {
          // Check for status conflicts
          const payment = farmerPayments[0];
          if (action === 'process' && payment.status !== 'pending') {
            conflicts.push({
              paymentId: payment.id,
              farmerRef: payment.farmer_ref,
              conflictType: 'status_mismatch',
              resolution: `payment_status_is_${payment.status}`,
            });
          } else {
            paymentsToProcess.push(payment.id);
          }
        }
      }

      // Process approved payments
      if (action === 'process' && paymentsToProcess.length > 0) {
        // Get farmer IDs from the payments to process
        const farmerIdsQuery = `
          SELECT DISTINCT farmer_id 
          FROM farmer_payments 
          WHERE id = ANY($1::bigint[])
        `;
        const farmerIdsResult = await client.query(farmerIdsQuery, [paymentsToProcess]);
        const farmerIds = farmerIdsResult.rows.map((r) => r.farmer_id);

        // Update farmer payment status to processed
        const updateFarmersQuery = `
          UPDATE farmers 
          SET 
            payment_status = 'processed',
            payment_processed_at = NOW(),
            updated_at = NOW()
          WHERE id = ANY($1::bigint[])
            AND payment_status = 'pending'
            AND deleted_at IS NULL
          RETURNING id, farmer_ref
        `;
        const updatedFarmers = await client.query(updateFarmersQuery, [farmerIds]);

        // Create payment processing records
        for (const farmer of updatedFarmers.rows) {
          await client.query(
            `INSERT INTO farmer_payments (
              farmer_id,
              reference_hash,
              currency,
              payment_method,
              amount,
              status,
              metadata,
              submitted_by,
              created_at
            ) VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              'processed',
              $6,
              'admin_batch_processing',
              NOW()
            )`,
            [
              farmer.id,
              `admin-batch-${Date.now()}-${farmer.id}`,
              currency || 'XLM',
              paymentMethod || 'wallet',
              0,
              JSON.stringify({
                reason: reason || 'Batch processing',
                processedPayments: paymentsToProcess.length,
                conflicts: conflicts.length,
              }),
            ]
          );
          // Webhook delivery is best-effort and persisted/retried independently
// of the verification transaction.
          void emitTreeWebhookEvent('tree.verified', {
            treeId: tree.id,
            treeRef: tree.tree_ref,
            previousStatus: 'planted',
            newStatus: 'verified',
            source: 'admin_batch_approval',
          });
        }
      }

      // Process cancelled payments
      if (action === 'cancel') {
        // Add cancellation metadata to payments
        const cancellationMetadata = {
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || 'Batch cancellation',
          cancelled_by: 'admin',
        };

        const updateCancelledQuery = `
          UPDATE farmer_payments 
          SET metadata = metadata || $1::jsonb, status = 'cancelled'
          WHERE id = ANY($2::bigint[])
        `;
        await client.query(updateCancelledQuery, [JSON.stringify(cancellationMetadata), paymentIds]);
      }

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        processed: paymentsToProcess.length,
        conflicts,
        action,
        currency,
        paymentMethod,
        message: `Successfully ${action}ed ${paymentsToProcess.length} payment(s)`,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error processing batch payment action:', error);
    return NextResponse.json({ error: 'Failed to process batch payment action' }, { status: 500 });
  }
}
