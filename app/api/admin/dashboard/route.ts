import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getAdminDashboardStats } from '@/lib/services/admin';

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await getAdminDashboardStats();

    return NextResponse.json({
      totalTrees: stats.totalTrees,
      pendingVerifications: stats.pendingVerifications,
      openDisputes: stats.openDisputes,
      feeTreasuryBalanceUsdc: stats.feeTreasuryBalanceUsdc,
    });
  } catch (error) {
    console.error('[admin/dashboard]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
