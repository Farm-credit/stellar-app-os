import { NextRequest, NextResponse } from 'next/server';
import {
  enrollCorporateProgram,
  listCorporatePrograms,
  type EnrollCorporateProgramRequest,
} from '@/lib/marketplace/corporateOffsetProgram';

export async function GET() {
  try {
    const programs = listCorporatePrograms();
    return NextResponse.json({
      success: true,
      count: programs.length,
      programs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to list corporate programs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: EnrollCorporateProgramRequest = await request.json();

    if (!body.companyName || !body.contactEmail || !body.target?.monthlyTargetTonnes) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: companyName, contactEmail, target.monthlyTargetTonnes',
        },
        { status: 400 }
      );
    }

    const program = enrollCorporateProgram(body);

    return NextResponse.json(
      {
        success: true,
        message: `Successfully enrolled ${program.companyName} into automated corporate offset program`,
        program,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to enroll corporate program' },
      { status: 400 }
    );
  }
}
