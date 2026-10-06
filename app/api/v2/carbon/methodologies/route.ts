import { NextRequest, NextResponse } from 'next/server';
import {
  listMethodologies,
  calculateMethodologyCredits,
  type MethodologyCategory,
  type CarbonStandard,
  type MethodologyStatus,
  type CalculationInput,
} from '@/lib/carbon/methodologyLibrary';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = (searchParams.get('category') as MethodologyCategory) || undefined;
    const standard = (searchParams.get('standard') as CarbonStandard) || undefined;
    const status = (searchParams.get('status') as MethodologyStatus) || undefined;
    const search = searchParams.get('search') || undefined;
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;

    const result = listMethodologies({
      category,
      standard,
      status,
      search,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to list carbon methodologies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { methodologyId, baselineEmissionsTonnes, projectEmissionsTonnes, leakageTonnes } = body;

    if (!methodologyId || baselineEmissionsTonnes === undefined || projectEmissionsTonnes === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: methodologyId, baselineEmissionsTonnes, projectEmissionsTonnes',
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

    const calculation = calculateMethodologyCredits(methodologyId, input);

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
