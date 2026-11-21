/**
 * seed-planting-locations.mjs
 *
 * Seeds the `planting_locations` table with the 8 realistic locations
 * from lib/api/mock/plantingLocations.ts. Used to populate a fresh
 * database for sponsor-map UI testing.
 *
 * Usage:
 *   node scripts/seed-planting-locations.mjs
 *
 * Required env vars:
 *   DATABASE_URL — PostgreSQL connection string
 */

import pg from 'pg';

const LOCATIONS = [
  {
    name: 'Kano Savanna Restoration',
    description:
      'Community-led reforestation of degraded Sahelian savanna in northern Nigeria. Partnering with smallholder farmers to establish agroforestry plots.',
    latitude: 12.0022,
    longitude: 8.5911,
    region: 'Sub-Saharan Africa',
    climate: 'Arid',
    species: ['acacia', 'neem', 'baobab', 'moringa', 'shea'],
    available_capacity: 15000,
  },
  {
    name: 'Volta Delta Mangrove Recovery',
    description:
      'Coastal mangrove restoration along the Volta River estuary. Protects shorelines and sequesters 2–4× more carbon than tropical forests.',
    latitude: 5.6312,
    longitude: 0.0483,
    region: 'Sub-Saharan Africa',
    climate: 'Tropical',
    species: ['mangrove', 'cashew'],
    available_capacity: 8200,
  },
  {
    name: 'Aberdare Highlands Watershed',
    description:
      'Reforestation of degraded upper watershed areas in the Aberdare Range, a critical water tower for Nairobi. Mixed indigenous plantings stabilize soil.',
    latitude: -0.4167,
    longitude: 36.6833,
    region: 'Sub-Saharan Africa',
    climate: 'Temperate',
    species: ['cedar', 'pine', 'eucalyptus', 'bamboo'],
    available_capacity: 22400,
  },
  {
    name: 'Brazilian Atlantic Corridor',
    description:
      'Restoring the threatened Atlantic Forest biome along Brazil’s eastern coast. Connecting fragmented patches to protect endemic species.',
    latitude: -12.9714,
    longitude: -38.5014,
    region: 'Latin America',
    climate: 'Tropical',
    species: ['mahogany', 'iroko', 'teak', 'bamboo'],
    available_capacity: 31000,
  },
  {
    name: 'Pacific Northwest Riparian Buffer',
    description:
      'Riparian reforestation along rivers in Oregon and Washington. Native hardwoods and conifers shade streams and improve salmon spawning habitat.',
    latitude: 45.5152,
    longitude: -122.6784,
    region: 'North America',
    climate: 'Temperate',
    species: ['pine', 'cedar', 'bamboo'],
    available_capacity: 6700,
  },
  {
    name: 'Indonesian Peatland Re-greening',
    description:
      'Rewetting and reforesting degraded peatlands in Sumatra. Preventing peat fires and restoring habitat for orangutans and other endangered species.',
    latitude: -0.7893,
    longitude: 113.9213,
    region: 'Southeast Asia',
    climate: 'Tropical',
    species: ['mangrove', 'teak', 'eucalyptus'],
    available_capacity: 19500,
  },
  {
    name: 'Mediterranean Dryland Restoration',
    description:
      'Restoring dryland forests in the Iberian interior using drought-tolerant native species. Combating desertification and supporting agroforestry livelihoods.',
    latitude: 39.4699,
    longitude: -6.3763,
    region: 'Europe',
    climate: 'Arid',
    species: ['pine', 'cedar', 'locust_bean'],
    available_capacity: 4300,
  },
  {
    name: 'Himalayan Foothill Agroforestry',
    description:
      'Slope stabilization and agroforestry in the Uttarakhand foothills. Mixed species reduce landslide risk while producing fruit and medicinal products.',
    latitude: 30.3165,
    longitude: 78.0322,
    region: 'South Asia',
    climate: 'Temperate',
    species: ['teak', 'bamboo', 'neem', 'moringa', 'cashew'],
    available_capacity: 11800,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[seed] DATABASE_URL is not set');
    process.exit(1);
  }

  const { Pool } = pg;
  const pool = new Pool({ connectionString, max: 5 });

  const upsertSQL = `
    INSERT INTO planting_locations
      (name, description, latitude, longitude, region, climate, species,
       available_capacity, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7::TEXT[],$8,NOW(),NOW())
    ON CONFLICT (name) DO UPDATE SET
      description       = EXCLUDED.description,
      latitude          = EXCLUDED.latitude,
      longitude         = EXCLUDED.longitude,
      region            = EXCLUDED.region,
      climate           = EXCLUDED.climate,
      species           = EXCLUDED.species,
      available_capacity = EXCLUDED.available_capacity,
      updated_at        = NOW()
  `;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const loc of LOCATIONS) {
      await client.query(upsertSQL, [
        loc.name,
        loc.description,
        loc.latitude,
        loc.longitude,
        loc.region,
        loc.climate,
        loc.species,
        loc.available_capacity,
      ]);
    }
    await client.query('COMMIT');
    console.log(`[seed] upserted ${LOCATIONS.length} planting_locations rows`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
