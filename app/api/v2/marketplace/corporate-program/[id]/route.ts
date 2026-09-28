import { NextRequest, NextResponse } from 'next/server';
import {
  getCorporateProgramById,
  updateCorporateProgram,
} from '@/lib/marketplace/corporateOffsetProgram';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const program = getCorporateProgramById(id);

    if (!program) {
      return NextResponse.json(
        { success: false, error: `Corporate program '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      program,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch corporate program' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updated = updateCorporateProgram(id, body);

    return NextResponse.json({
      success: true,
      message: `Updated program for ${updated.companyName}`,
      program: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update corporate program' },
      { status: 400 }
    );
  }
}
