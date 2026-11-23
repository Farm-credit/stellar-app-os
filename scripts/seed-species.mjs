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

/**
 * `species_category` values in the CSV → on-chain `SpeciesCategory` variant
 * names (#1807).  These strings must match
 * `contracts/species-registry/src/lib.rs` exactly.
 *
 * A fieldless Soroban enum is a union with void cases, so it serialises as a
 * one-element `Vec` holding the variant name as a `Symbol` — not as a bare
 * `Symbol` and not as the integer code used in events.  See
 * `encodeCategory()` below.
 */
const CATEGORY_VARIANTS = {
  native: 'Native',
  fast_growing: 'FastGrowing',
  unclassified: 'Unclassified',
};

/** Encode a `SpeciesCategory` variant the way the contract expects it. */
function encodeCategory(variantName) {
  return xdr.ScVal.scvVec([nativeToScVal(variantName, { type: 'symbol' })]);
}

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
 *
 * Classified rows (#1807) call:
 *   register_classified_species(slug, co2_kg_per_year_scaled, maturity_years,
 *                              category)
 * which stores the category's default ecological yield multiplier (native
 * 1.20×, fast-growing 0.80×).  Rows without a known `species_category` call
 * the legacy `register_species`, which lands in `Unclassified` at a neutral
 * 1.00× — exactly the pre-#1807 behaviour.
 *
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

  let classified = 0;
  let unclassified = 0;

  for (const row of rows) {
    const co2Scaled = Math.round(parseFloat(row.co2_kg_per_year) * 100);
    const maturity = parseInt(row.maturity_years, 10);

    const rawCategory = (row.species_category ?? '').trim().toLowerCase();
    const category = CATEGORY_VARIANTS[rawCategory];
    if (rawCategory && !category) {
      console.warn(
        `[chain] ${row.slug}: unknown species_category "${rawCategory}" — falling back to unclassified`,
      );
    }

    const args = [
      nativeToScVal(row.slug, { type: 'symbol' }),
      nativeToScVal(co2Scaled, { type: 'i128' }),
      nativeToScVal(maturity, { type: 'u32' }),
    ];
    const method = category && category !== 'Unclassified'
      ? 'register_classified_species'
      : 'register_species';

    if (method === 'register_classified_species') {
      args.push(encodeCategory(category));
    }

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const prepared = await rpc.prepareTransaction(tx);
    prepared.sign(admin);

    try {
      const result = await rpc.sendTransaction(prepared);
      console.log(
        `[chain] registered ${row.slug} as ${category ?? 'Unclassified'} — tx: ${result.hash}`,
      );
      if (method === 'register_classified_species') classified += 1;
      else unclassified += 1;
    } catch (err) {
      console.error(`[chain] failed to register ${row.slug}:`, err?.message ?? err);
    }

    // Increment sequence for next op
    account.incrementSequenceNumber();
  }

  console.log(
    `[chain] ${classified} classified / ${unclassified} unclassified species registered`,
  );
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
