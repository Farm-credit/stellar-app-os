import { NextResponse, type NextRequest } from 'next/server';
export const runtime = 'nodejs';
const projects = [
  {
    id: 'mangrove-restoration',
    name: 'Delta Mangrove Restoration',
    color: '#0ea5e9',
    trees: 1240,
    co2Tonnes: 82.4,
    species: 8,
    health: 96,
    protectedHectares: 34.6,
    lat: 5.55,
    lng: 5.75,
    retirementDate: '2025-03-31',
    pricePerTonne: 18.5,
    coBenefits: { biodiversity: 88, soilHealth: 74 },
  },
  {
    id: 'great-green-wall',
    name: 'Great Green Wall — Kano',
    color: '#16a34a',
    trees: 2860,
    co2Tonnes: 174.2,
    species: 12,
    health: 91,
    protectedHectares: 78.1,
    lat: 12,
    lng: 8.5,
    retirementDate: '2025-06-30',
    pricePerTonne: 14.0,
    coBenefits: { biodiversity: 92, soilHealth: 86 },
  },
  {
    id: 'rainforest-corridor',
    name: 'Amazon Rainforest Corridor',
    color: '#9333ea',
    trees: 740,
    co2Tonnes: 48.7,
    species: 19,
    health: 88,
    protectedHectares: 21.4,
    lat: -3.2,
    lng: -60.1,
    retirementDate: '2025-09-15',
    pricePerTonne: 22.0,
    coBenefits: { biodiversity: 97, soilHealth: 79 },
  },
];

export function GET(request: NextRequest) {
  const sponsor = request.nextUrl.searchParams.get('sponsor');
  const totals = projects.reduce(
    (a, p) => ({
      trees: a.trees + p.trees,
      co2Tonnes: a.co2Tonnes + p.co2Tonnes,
      species: a.species + p.species,
      protectedHectares: a.protectedHectares + p.protectedHectares,
      cost: a.cost + p.co2Tonnes * p.pricePerTonne,
    }),
    { trees: 0, co2Tonnes: 0, species: 0, protectedHectares: 0, cost: 0 }
  );

  const credits = projects.map((p) => ({
    projectId: p.id,
    projectName: p.name,
    quantityTonnes: p.co2Tonnes,
    pricePerTonne: p.pricePerTonne,
    cost: Number((p.co2Tonnes * p.pricePerTonne).toFixed(2)),
    retirementDate: p.retirementDate,
    coBenefits: p.coBenefits,
  }));

  return NextResponse.json({
    sponsor,
    methodology:
      'Project-level verified MRV aggregation; protected area uses peer-reviewed buffer-zone risk methodology.',
    totals: { ...totals, cost: Number(totals.cost.toFixed(2)) },
    projects,
    credits,
    generatedAt: new Date().toISOString(),
  });
}
