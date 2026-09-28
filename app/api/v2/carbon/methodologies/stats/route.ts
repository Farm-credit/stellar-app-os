import { NextResponse } from 'next/server';
import { getMethodologyLibraryStats } from '@/lib/carbon/methodologyLibrary';

export async function GET() {
  try {
    const stats = getMethodologyLibraryStats();
    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch methodology stats' },
      { status: 500 }
    );
  }
}
