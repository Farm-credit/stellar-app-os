import { NextResponse } from 'next/server';

export interface ImpactStats {
  treesPlanted: number;
  co2OffsetTonnes: number;
  farmersSupported: number;
  countriesReached: number;
}

export interface RegionMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  treesPlanted: number;
  farmers: number;
}

export interface ImpactData {
  stats: ImpactStats;
  regions: RegionMarker[];
}

// Mock data — replace with DB queries when available
const IMPACT_DATA: ImpactData = {
  stats: {
    treesPlanted: 142_850,
    co2OffsetTonnes: 6_856,
    farmersSupported: 3_214,
    countriesReached: 7,
  },
  regions: [
    { id: 'kano', name: 'Kano, Nigeria', lat: 12.0, lng: 8.52, treesPlanted: 38_400, farmers: 820 },
    {
      id: 'kaduna',
      name: 'Kaduna, Nigeria',
      lat: 10.52,
      lng: 7.44,
      treesPlanted: 29_100,
      farmers: 610,
    },
    {
      id: 'sokoto',
      name: 'Sokoto, Nigeria',
      lat: 13.06,
      lng: 5.24,
      treesPlanted: 21_300,
      farmers: 450,
    },
    {
      id: 'niger',
      name: 'Niger State, Nigeria',
      lat: 9.93,
      lng: 5.6,
      treesPlanted: 18_750,
      farmers: 390,
    },
    {
      id: 'accra',
      name: 'Greater Accra, Ghana',
      lat: 5.6,
      lng: -0.2,
      treesPlanted: 14_200,
      farmers: 310,
    },
    {
      id: 'nairobi',
      name: 'Nairobi, Kenya',
      lat: -1.29,
      lng: 36.82,
      treesPlanted: 12_600,
      farmers: 280,
    },
    {
      id: 'kampala',
      name: 'Kampala, Uganda',
      lat: 0.32,
      lng: 32.58,
      treesPlanted: 8_500,
      farmers: 354,
    },
  ],
};

export function GET() {
  return NextResponse.json(IMPACT_DATA, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
