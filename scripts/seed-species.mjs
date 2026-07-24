/**
 * seed-species.mjs — Issue #554
 *
 * Parses data/fao_co2_rates.csv and upserts every row into the
 * species_catalogue DB table, then registers each species on-chain via
 * the species-registry Soroban contract.
 *
 * Usage:
 *   node scripts/seed-species.mjs
 *
 * Required env vars:
 *   DATABASE_URL             — postgres connection string
 *   SPECIES_REGISTRY_ID      — deployed species-registry contract ID
 *   STELLAR_NETWORK          — "testnet" | "mainnet"  (default: testnet)
 *   ADMIN_SECRET             — Stellar secret key of the contract admin
 */

import { createReadStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readline } from 'node:readline';
import { createInterface } from 'node:readline';
import pg from 'pg';
import {
  Keypair,
  Networks,
  nativeToScVal,
  xdr,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  Contract,
} from '@stellar/stellar-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '../data/fao_co2_rates.csv');

const NETWORK = process.env.STELLAR_NETWORK ?? 'testnet';
const RPC_URL =
  NETWORK === 'mainnet'
    ? 'https://soroban.stellar.org'
    : 'https://soroban-testnet.stellar.org';
const PASSPHRASE =
  NETWORK === 'mainnet'
    ? Networks.PUBLIC
    : Networks.TESTNET;

// ── CSV parsing ───────────────────────────────────────────────────────────────

/** Parse the CSV into an array of plain objects. */
async function parseCSV(path) {
  const rows = [];
  const rl = createInterface({ input: createReadStream(path) });

  let headers = null;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split(',');
    if (!headers) {
      headers = cols;
      continue;
    }
    const row = {};
    headers.forEach((h, i) => (row[h] = cols[i] ?? ''));
    rows.push(row);
  }
  return rows;
}

// ── Database seeding ──────────────────────────────────────────────────────────

async function seedDatabase(rows) {
  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

  const upsertSQL = `
    INSERT INTO species_catalogue
      (slug, common_name, scientific_name, co2_kg_per_year, maturity_years,
       biome, native_regions, source_ref, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    ON CONFLICT (slug) DO UPDATE SET
      common_name     = EXCLUDED.common_name,
      scientific_name = EXCLUDED.scientific_name,
      co2_kg_per_year = EXCLUDED.co2_kg_per_year,
      maturity_years  = EXCLUDED.maturity_years,
      biome           = EXCLUDED.biome,
      native_regions  = EXCLUDED.native_regions,
      source_ref      = EXCLUDED.source_ref,
      updated_at      = NOW()
  `;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(upsertSQL, [
        row.slug,
        row.common_name,
        row.scientific_name,
        parseFloat(row.co2_kg_per_year),
        parseInt(row.maturity_years, 10),
        row.biome,
        row.native_regions,
        row.source_ref,
      ]);
    }
    await client.query('COMMIT');
    console.log(`[db] upserted ${rows.length} species`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// ── On-chain registration ─────────────────────────────────────────────────────

/**
 * Register each species in the species-registry Soroban contract.
 * Calls: register_species(slug, co2_kg_per_year_scaled, maturity_years)
 * co2_kg_per_year is scaled ×100 to avoid floating point (stored as integer).
 */
async function seedOnChain(rows) {
  const contractId = process.env.SPECIES_REGISTRY_ID;
  if (!contractId) {
    console.warn('[chain] SPECIES_REGISTRY_ID not set — skipping on-chain seeding');
    return;
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    console.warn('[chain] ADMIN_SECRET not set — skipping on-chain seeding');
    return;
  }

  const admin = Keypair.fromSecret(adminSecret);
  const rpc = new SorobanRpc.Server(RPC_URL);
  const contract = new Contract(contractId);

  const account = await rpc.getAccount(admin.publicKey());

  for (const row of rows) {
    const co2Scaled = Math.round(parseFloat(row.co2_kg_per_year) * 100);
    const maturity = parseInt(row.maturity_years, 10);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(
        contract.call(
          'register_species',
          nativeToScVal(row.slug, { type: 'symbol' }),
          nativeToScVal(co2Scaled, { type: 'i128' }),
          nativeToScVal(maturity, { type: 'u32' }),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await rpc.prepareTransaction(tx);
    prepared.sign(admin);

    try {
      const result = await rpc.sendTransaction(prepared);
      console.log(`[chain] registered ${row.slug} — tx: ${result.hash}`);
    } catch (err) {
      console.error(`[chain] failed to register ${row.slug}:`, err?.message ?? err);
    }

    // Increment sequence for next op
    account.incrementSequenceNumber();
  }
}

// ── Carbon-credits on-chain registration ──────────────────────────────────────

/**
 * Register each species rate in the carbon-credits Soroban contract.
 * Calls: set_rate(slug, co2_scaled, maturity_years)
 *
 * Required env vars:
 *   CARBON_CREDITS_CONTRACT_ID — deployed carbon-credits contract ID
 *   ADMIN_SECRET               — same admin keypair used for species-registry
 */
async function seedCarbonCredits(rows) {
  const contractId = process.env.CARBON_CREDITS_CONTRACT_ID;
  if (!contractId) {
    console.warn('[carbon] CARBON_CREDITS_CONTRACT_ID not set — skipping carbon-credits seeding');
    return;
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    console.warn('[carbon] ADMIN_SECRET not set — skipping carbon-credits seeding');
    return;
  }

  const admin = Keypair.fromSecret(adminSecret);
  const rpc = new SorobanRpc.Server(RPC_URL);
  const contract = new Contract(contractId);

  const account = await rpc.getAccount(admin.publicKey());

  for (const row of rows) {
    const co2Scaled = Math.round(parseFloat(row.co2_kg_per_year) * 100);
    const maturity = parseInt(row.maturity_years, 10);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(
        contract.call(
          'set_rate',
          nativeToScVal(row.slug, { type: 'symbol' }),
          nativeToScVal(co2Scaled, { type: 'i128' }),
          nativeToScVal(maturity, { type: 'u32' }),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await rpc.prepareTransaction(tx);
    prepared.sign(admin);

    try {
      const result = await rpc.sendTransaction(prepared);
      console.log(`[carbon] set_rate ${row.slug} — tx: ${result.hash}`);
    } catch (err) {
      console.error(`[carbon] failed to set_rate ${row.slug}:`, err?.message ?? err);
    }

    account.incrementSequenceNumber();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[seed-species] parsing', CSV_PATH);
  const rows = await parseCSV(CSV_PATH);
  console.log(`[seed-species] parsed ${rows.length} rows`);

  await seedDatabase(rows);
  await seedOnChain(rows);
  await seedCarbonCredits(rows);

  console.log('[seed-species] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
