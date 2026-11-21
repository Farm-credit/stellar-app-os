#!/usr/bin/env node
/**
 * Testnet sponsor-to-payout integration test.
 *
 * This harness intentionally uses the Stellar CLI instead of embedding secrets.
 * It performs real invocations against Testnet and fails on any non-zero command
 * or unexpected contract state. A fresh job cannot complete survival immediately;
 * after planting, rerun with TESTNET_FLOW_PHASE=survival once the contract's
 * six-month policy is satisfied.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const NETWORK = process.env.TESTNET_NETWORK ?? 'testnet';
const PHASE = process.env.TESTNET_FLOW_PHASE ?? 'all';
const DRY_RUN = process.argv.includes('--dry-run');
const SURVIVAL_READY = process.env.TESTNET_SURVIVAL_READY === 'true';

const config = {
  escrowId: process.env.TREE_ESCROW_CONTRACT_ID,
  sponsorSource: process.env.TESTNET_SPONSOR_SOURCE,
  adminSource: process.env.TESTNET_ADMIN_SOURCE,
  sponsorAddress: process.env.TESTNET_SPONSOR_ADDRESS,
  planterAddress: process.env.TESTNET_PLANTER_ADDRESS,
  tokenAddress: process.env.TESTNET_TOKEN_CONTRACT_ID,
  amount: process.env.TESTNET_ESCROW_AMOUNT ?? '10000000',
  treeCount: process.env.TESTNET_TREE_COUNT ?? '1',
  survivalRate: process.env.TESTNET_SURVIVAL_RATE ?? '85',
};

const requiredByPhase = {
  all: ['escrowId', 'sponsorSource', 'adminSource', 'sponsorAddress', 'planterAddress', 'tokenAddress'],
  planting: ['escrowId', 'adminSource', 'planterAddress'],
  survival: ['escrowId', 'adminSource', 'planterAddress'],
};

if (!Object.hasOwn(requiredByPhase, PHASE)) {
  throw new Error(`TESTNET_FLOW_PHASE must be one of: ${Object.keys(requiredByPhase).join(', ')}`);
}

if (!DRY_RUN) {
  const missing = requiredByPhase[PHASE].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.map((key) => key.toUpperCase()).join(', ')}`);
  }
}

function proof(label) {
  return createHash('sha256').update(`farmcredit:testnet:${label}`).digest('hex');
}

function displayValue(value, key) {
  return value ?? `<${key.toUpperCase()}>`;
}

function commandArgs(method, args = {}, source = config.adminSource) {
  const argv = [
    'contract',
    'invoke',
    '--id',
    displayValue(config.escrowId, 'tree_escrow_contract_id'),
    '--network',
    NETWORK,
  ];
  if (source || DRY_RUN) argv.push('--source', displayValue(source, 'testnet_source'));
  argv.push('--', method);
  for (const [name, value] of Object.entries(args)) {
    argv.push(`--${name}`, String(value ?? `<${name.toUpperCase()}>`));
  }
  return argv;
}

function printable(argv) {
  return ['stellar', ...argv].map((part) => (/secret|seed|SC[A-Z0-9]+/.test(part) ? '<redacted>' : part)).join(' ');
}

function invoke(method, args = {}, source = config.adminSource) {
  const argv = commandArgs(method, args, source);
  console.log(`$ ${printable(argv)}`);
  if (DRY_RUN) return '';
  return execFileSync('stellar', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function assertState(output, state, step) {
  if (!new RegExp(`\\b${state}\\b`).test(output)) {
    throw new Error(`${step}: expected contract response to contain state ${state}; got:\n${output}`);
  }
  console.log(`PASS ${step}: observed ${state}`);
}

function readRecord() {
  return invoke('get_record', { farmer: config.planterAddress }, config.adminSource);
}

function deposit() {
  return invoke(
    'deposit',
    {
      donor: config.sponsorAddress,
      farmer: config.planterAddress,
      token: config.tokenAddress,
      amount: config.amount,
      tree_count: config.treeCount,
    },
    config.sponsorSource,
  );
}

function verifyPlanting() {
  return invoke(
    'verify_planting',
    {
      farmer: config.planterAddress,
      proof_hash: proof('planting'),
      verified_tree_count: config.treeCount,
    },
    config.adminSource,
  );
}

function verifySurvival() {
  return invoke(
    'verify_survival',
    {
      farmer: config.planterAddress,
      proof_hash: proof('survival'),
      survival_rate_percent: config.survivalRate,
    },
    config.adminSource,
  );
}

function main() {
  console.log(`Testnet sponsor-to-payout flow (phase=${PHASE}, dryRun=${DRY_RUN})`);

  if (PHASE === 'all') {
    deposit();
    if (!DRY_RUN) assertState(readRecord(), 'Funded', 'sponsor deposit');
    else console.log('DRY RUN sponsor deposit prepared');

    verifyPlanting();
    if (!DRY_RUN) assertState(readRecord(), 'Planted', 'verifier planting approval');
    else console.log('DRY RUN verifier planting approval prepared');

    if (!SURVIVAL_READY) {
      console.log(
        'Planting phase passed. Survival payout is intentionally not attempted on a fresh job until the contract\'s six-month policy is satisfied. Rerun with TESTNET_FLOW_PHASE=survival TESTNET_SURVIVAL_READY=true.',
      );
      return;
    }
  }

  if (PHASE === 'planting') {
    verifyPlanting();
    if (!DRY_RUN) assertState(readRecord(), 'Planted', 'verifier planting approval');
  }

  if (PHASE === 'survival' || (PHASE === 'all' && SURVIVAL_READY)) {
    if (!SURVIVAL_READY && !DRY_RUN) {
      throw new Error('Refusing survival payout: set TESTNET_SURVIVAL_READY=true only after the six-month contract policy is satisfied.');
    }
    verifySurvival();
    if (!DRY_RUN) assertState(readRecord(), 'Completed', 'survival approval and payout');
    else console.log('DRY RUN survival approval and payout prepared');
  }

  console.log('PASS testnet sponsor-to-payout flow');
}

try {
  main();
} catch (error) {
  console.error(`FAIL testnet sponsor-to-payout flow: ${error.message}`);
  process.exitCode = 1;
}
