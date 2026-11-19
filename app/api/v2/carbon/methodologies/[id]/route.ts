import { NextRequest, NextResponse } from 'next/server';
import {
  getMethodologyById,
  calculateMethodologyCredits,
  type CalculationInput,
} from '@/lib/carbon/methodologyLibrary';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const methodology = getMethodologyById(id);

    if (!methodology) {
      return NextResponse.json(
        { success: false, error: `Methodology with ID or Code '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      methodology,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch methodology' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { baselineEmissionsTonnes, projectEmissionsTonnes, leakageTonnes } = body;

    if (baselineEmissionsTonnes === undefined || projectEmissionsTonnes === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: baselineEmissionsTonnes, projectEmissionsTonnes',
        },
        { status: 400 }
      );
    }

    const input: CalculationInput = {
      baselineEmissionsTonnes: Number(baselineEmissionsTonnes),
      projectEmissionsTonnes: Number(projectEmissionsTonnes),
      leakageTonnes: leakageTonnes !== undefined ? Number(leakageTonnes) : 0,
      customParameters: body.customParameters,
    };

    const calculation = calculateMethodologyCredits(id, input);

    return NextResponse.json({
      success: true,
      calculation,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to calculate credits' },
      { status: 400 }
    );
  }
}
