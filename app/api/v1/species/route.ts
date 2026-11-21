/**
 * Public Species API — GET /api/v1/species
 *
 * REST endpoint for third-party apps to read tree species metadata,
 * carbon sequestration rates, growth horizons, and ecological details.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate, applyRateLimit, unauthorized, rateLimited } from '@/app/api/v1/trees/route';
import { TREE_SPECIES } from '@/lib/constants/species';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface SpeciesRecord {
  id: string;
  name: string;
  slug: string;
  scientificName: string;
  co2KgPerYear: number;
  maturityYears: number;
  growthRate: 'fast' | 'moderate' | 'slow';
  supportedClimateZones: string[];
  ecologicalBenefits: string[];
}

const SCIENTIFIC_NAMES: Record<string, string> = {
  Teak: 'Tectona grandis',
  Moringa: 'Moringa oleifera',
  Eucalyptus: 'Eucalyptus camaldulensis',
  Mangrove: 'Rhizophora mangle',
  Acacia: 'Senegalia senegal',
  Neem: 'Azadirachta indica',
  'African Mahogany': 'Khaya senegalensis',
  Baobab: 'Adansonia digitata',
  'Bamboo (Moso)': 'Phyllostachys edulis',
  'West African Cedar': 'Entandrophragma cylindricum',
  'Caribbean Pine': 'Pinus caribaea',
  Iroko: 'Milicia excelsa',
  Shea: 'Vitellaria paradoxa',
  Cashew: 'Anacardium occidentale',
  'African Locust Bean': 'Parkia biglobosa',
};

const GROWTH_RATES: Record<string, 'fast' | 'moderate' | 'slow'> = {
  Moringa: 'fast',
  'Bamboo (Moso)': 'fast',
  Eucalyptus: 'fast',
  Neem: 'fast',
  Teak: 'moderate',
  Mangrove: 'moderate',
  Acacia: 'moderate',
  Cashew: 'moderate',
  'African Mahogany': 'slow',
  Baobab: 'slow',
  'West African Cedar': 'slow',
  Iroko: 'slow',
  Shea: 'slow',
  'African Locust Bean': 'moderate',
  'Caribbean Pine': 'moderate',
};

const ECOLOGICAL_BENEFITS: Record<string, string[]> = {
  Mangrove: ['Coastal erosion protection', 'Marine nursery habitat', 'High blue carbon burial'],
  Moringa: ['Soil nitrogen fixing', 'Nutritional foliage', 'Drought-tolerant deep taproots'],
  Teak: ['High carbon density timber', 'Canopy microclimate cooling', 'Long-term biomass carbon lock'],
  Baobab: ['Water retention in arid soils', 'Pollinator haven', 'Cultural and ecological keystone'],
  'Bamboo (Moso)': ['Rapid topsoil stabilization', 'Fast-cycle carbon capture', 'Zero-till regeneration'],
  Acacia: ['Gum arabic production', 'Nitrogen-fixing bacteria nodules', 'Desertification barrier'],
  Neem: ['Natural pest deterrence', 'High shade canopy', 'Hardy semi-arid survival'],
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = authenticate(req);
  if (!ctx) return unauthorized();

  const rl = applyRateLimit(ctx);
  if (!rl.ok) return rateLimited(rl.headers);

  const { searchParams } = new URL(req.url);
  const minCo2 = Number.parseFloat(searchParams.get('min_co2') ?? '0') || 0;
  const growthRate = searchParams.get('growth_rate');

  const speciesList: SpeciesRecord[] = TREE_SPECIES.map((s, idx) => {
    return {
      id: `sp-${idx + 1}`,
      name: s.name,
      slug: s.slug,
      scientificName: SCIENTIFIC_NAMES[s.name] ?? s.name,
      co2KgPerYear: s.co2KgPerYear,
      maturityYears: s.maturityYears,
      growthRate: GROWTH_RATES[s.name] ?? 'moderate',
      supportedClimateZones: Object.keys(s.growthByClimateZone),
      ecologicalBenefits: ECOLOGICAL_BENEFITS[s.name] ?? ['Carbon sequestration', 'Soil biodiversity'],
    };
  });

  let filtered = speciesList;
  if (minCo2 > 0) {
    filtered = filtered.filter((s) => s.co2KgPerYear >= minCo2);
  }
  if (growthRate) {
    filtered = filtered.filter((s) => s.growthRate.toLowerCase() === growthRate.toLowerCase());
  }

  return NextResponse.json(
    {
      data: filtered,
      total: filtered.length,
    },
    { status: 200, headers: rl.headers }
  );
}
