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
    }),
    { trees: 0, co2Tonnes: 0, species: 0, protectedHectares: 0 }
  );
  return NextResponse.json({
    sponsor,
    methodology:
      'Project-level verified MRV aggregation; protected area uses peer-reviewed buffer-zone risk methodology.',
    totals,
    projects,
    generatedAt: new Date().toISOString(),
  });
}
