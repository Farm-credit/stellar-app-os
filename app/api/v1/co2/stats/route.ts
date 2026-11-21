/**
 * Public CO2 Stats API — GET /api/v1/co2/stats
 *
 * REST endpoint for third-party apps to read tree sponsorship CO2 sequestration statistics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate, applyRateLimit, unauthorized, rateLimited } from '@/app/api/v1/trees/route';
import { getMockTrees } from '@/lib/api/mock/trees';
import { PROJECTS } from '@/app/api/v1/projects/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = authenticate(req);
  if (!ctx) return unauthorized();

  const rl = applyRateLimit(ctx);
  if (!rl.ok) return rateLimited(rl.headers);

  const trees = getMockTrees();
  const totalTrees = trees.length;

  let totalCo2KgPerYear = 0;
  const speciesMap = new Map<string, { count: number; co2Kg: number }>();

  for (const tree of trees) {
    totalCo2KgPerYear += tree.co2OffsetKgPerYear;
    const existing = speciesMap.get(tree.species) ?? { count: 0, co2Kg: 0 };
    existing.count += 1;
    existing.co2Kg += tree.co2OffsetKgPerYear;
    speciesMap.set(tree.species, existing);
  }

  const bySpecies = Array.from(speciesMap.entries()).map(([species, data]) => ({
    species,
    treeCount: data.count,
    totalCo2KgPerYear: data.co2Kg,
    averageCo2KgPerTree: Math.round((data.co2Kg / data.count) * 10) / 10,
  }));

  const byProject = PROJECTS.map((p) => ({
    projectId: p.id,
    projectName: p.name,
    totalTrees: p.totalTrees,
    sponsoredTrees: p.sponsoredTrees,
    totalCo2OffsetKgPerYear: p.totalCo2OffsetKgPerYear,
    totalCo2OffsetTonnesPerYear: Math.round((p.totalCo2OffsetKgPerYear / 1000) * 10) / 10,
  }));

  const totalTonnes = Math.round((totalCo2KgPerYear / 1000) * 100) / 100;
  const sponsoredTreesCount = trees.filter((t) => t.status === 'verified' || t.status === 'completed').length;

  // Real-world environmental impact equivalencies (EPA standard factors)
  // ~4,600 kg CO2 / typical passenger vehicle per year
  // ~900 kg CO2 / round-trip transatlantic passenger flight
  // ~7,500 kg CO2 / average household annual electricity
  const carsOffRoad = Math.round((totalCo2KgPerYear / 4600) * 10) / 10;
  const passengerFlights = Math.round(totalCo2KgPerYear / 900);
  const homesElectricity = Math.round((totalCo2KgPerYear / 7500) * 10) / 10;

  return NextResponse.json(
    {
      summary: {
        totalTreesTracked: totalTrees,
        sponsoredTreesCount,
        totalCo2OffsetKgPerYear: totalCo2KgPerYear,
        totalCo2OffsetTonnesPerYear: totalTonnes,
        averageCo2PerTreeKg: totalTrees > 0 ? Math.round((totalCo2KgPerYear / totalTrees) * 10) / 10 : 0,
      },
      impactEquivalencies: {
        passengerVehiclesOffRoadPerYear: carsOffRoad,
        passengerFlightsOffset: passengerFlights,
        homesAnnualElectricityOffset: homesElectricity,
      },
      breakdownBySpecies: bySpecies,
      breakdownByProject: byProject,
      calculatedAt: new Date().toISOString(),
    },
    { status: 200, headers: rl.headers }
  );
}
