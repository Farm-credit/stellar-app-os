#!/usr/bin/env node
/**
 * Soroban/Stellar deployment orchestrator — Closes #504
 *
 * Reads the workspace Cargo manifest, builds each deployable contract to
 * WASM, deploys them in dependency order to the configured Stellar network,
 * invokes their `initialize` entry-points with the right types, and writes
 * an idempotent deployment manifest to `deployments/<network>.json`.
 *
 * Usage:
 *   node scripts/orchestrate.mjs --network testnet --identity admin
 *   node scripts/orchestrate.mjs --network mainnet --identity ops --only tree-escrow
 *   node scripts/orchestrate.mjs --network testnet --identity admin --skip verifier-staking
 *
 * Run `node scripts/orchestrate.mjs --help` to see all options.
 *
 * Phase 0  → Resolve / deploy SACs (XLM, USDC, TREE, stake-token).
 * Phase 1  → admin-controls
 * Phase 2  → single-admin registries (10 crates)
 * Phase 3  → verifier-staking
 * Phase 4  → voting / governance (species-voting, platform-governance)
 * Phase 5  → escrow & payments (escrow, donation-escrow, subscription-sponsorship,
 *             treasury, naira-payout)
 * Phase 6  → tree-escrow + tree-token (special: SAC admin transfer)
 * Phase 7  → sponsor-receipt
 *
 * Idempotency:
 *   • Each contract is skipped if its address already lives in the manifest
 *     unless --force or --only is given.
 *   • The orchestrator persists the manifest after every successful
 *     deploy, so a Ctrl+C at phase 5 → phase 6 can be resumed by re-running
 *     without --force.
 *
 * TREE SAC pitfall:
 *   `tree-escrow` requires the contract itself to be the SAC admin so it can
 *   `mint` rewards. The legacy `scripts/deploy-tree-asset.mjs` script locks
 *   the issuer (master weight = 0); if you use that script, `tree-escrow`'s
 *   init call will always fail. This orchestrator instead transfers the SAC
 *   admin to tree-escrow at Phase 6 (step 6b) before invoking initialize.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertIdentityConfigured,
  assertPrerequisites,
  contractsRoot,
  ensureDeploymentsDir,
  logInfo,
  logOk,
  logPhase,
  logStep,
  logWarn,
  manifestPath,
  parseContractId,
  readManifest,
  run,
  wasmPath,
  writeManifest,
} from './lib/deploy-helpers.mjs';

import {
  deployAssetSac,
  getProvidedAddress,
  networkConfig,
  setSacAdmin,
  usdcAddress,
  xlmAddress,
} from './sac-deploy.mjs';

// ── CLI parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    network: null,
    identity: null,
    only: [], // --only foo --only bar
    skip: [], // --skip baz
    force: false,
    config: process.env.DEPLOY_CONFIG?.trim() || 'scripts/deploy.config.json',
    noBuild: false,
    buildOnly: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--network':
      case '-n':
        opts.network = requireArg(argv, i++, 'network');
        break;
      case '--identity':
      case '-i':
        opts.identity = requireArg(argv, i++, 'identity');
        break;
      case '--only':
        opts.only.push(requireArg(argv, i++, 'crate'));
        break;
      case '--skip':
        opts.skip.push(requireArg(argv, i++, 'crate'));
        break;
      case '--force':
        opts.force = true;
        break;
      case '--no-build':
        opts.noBuild = true;
        break;
      case '--build-only':
        opts.buildOnly = true;
        break;
      case '--config':
      case '-c':
        opts.config = requireArg(argv, i++, 'path');
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function requireArg(argv, i, name) {
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) {
    throw new Error(`Missing value for --${name}`);
  }
  return v;
}

function printHelp() {
  const lines = [
    'Soroban deploy orchestrator',
    '',
    'USAGE: node scripts/orchestrate.mjs [options]',
    '',
    '  -n, --network <testnet|mainnet|futurenet>   Target network (required)',
    '  -i, --identity <key-alias>                   Local soroban/stellar key (required)',
    '      --only <crate>                           Only deploy these crates (repeatable)',
    '      --skip <crate>                           Skip these crates (repeatable)',
    '      --force                                  Re-deploy even if present in manifest',
    '      --no-build                               Skip "soroban contract build"',
    '      --build-only                             Only build wasm, do not deploy',
    '  -c, --config <path>                          Config JSON (default scripts/deploy.config.json)',
    '  -h, --help                                   This help',
    '',
    'A deployment manifest is written to deployments/<network>.json and updated',
    'after every successful contract initialisation. Idempotency: contracts',
    'already in the manifest are skipped unless --force is given.',
    '',
  ];
  console.log(lines.join('\n'));
}

// ── Config loading ────────────────────────────────────────────────────────────

/** Load the optional config JSON. Missing file → sensible defaults. */
function loadConfig(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse config at ${path}: ${err.message}`);
  }
}

function mergeConfig(fileCfg) {
  const env = {
    network: process.env.DEPLOY_NETWORK?.trim() || undefined,
    identity: process.env.DEPLOY_IDENTITY?.trim() || undefined,
  };
  return {
    skip: fileCfg?.contracts?.skip ?? [],
    only: fileCfg?.contracts?.only ?? [],
    force: fileCfg?.contracts?.force ?? false,
    overrides: fileCfg?.contracts ?? {},
    assets: fileCfg?.assets ?? {},
    network: env.network ?? fileCfg?.network ?? 'testnet',
    identity: env.identity ?? fileCfg?.identity ?? null,
  };
}

// ── Build step ────────────────────────────────────────────────────────────────

/** Run `soroban contract build` for every workspace member. We surface the
 *  built wasm path and skip contracts whose wasm is already up to date. */
async function buildWorkspace(members, opts) {
  if (opts.noBuild) {
    logStep('--no-build set; relying on pre-existing wasm artifacts');
    return;
  }

  logStep(`Building ${members.length} contracts to wasm32-unknown-unknown…`);

  // Sort: keep Cargo's member order but put leaf crates that require no
  // cross-crate deps first so failures are isolated.
  for (const crate of members.crates) {
    const target = wasmPath(crate);
    const src = resolve(contractsRoot(), crate, 'src/lib.rs');
    if (!existsSync(src)) {
      logWarn(`No src/lib.rs for ${crate}; skipping build (not a deployable target?).`);
      continue;
    }
    logInfo(`Building ${crate} → ${target.replace(`${contractsRoot()}/`, '')}`);
    run(
      'cargo',
      [
        'build',
        '--target',
        'wasm32-unknown-unknown',
        '--release',
        '--manifest-path',
        resolve(contractsRoot(), 'Cargo.toml'),
        '-p',
        crate,
      ],
      { cwd: process.cwd() },
    );
  }
  logOk('All contracts built.');
}

// ── Deploy + init pipeline ────────────────────────────────────────────────────

/**
 * Run one deploy + initialize step, returning the new contract ID. Skips if
 * the manifest already contains the address and `--force` is not set.
 *
 * @param {object} ctx - shared state (manifest, networkCfg, identity, config)
 * @param {string} crate - workspace crate name (also key in manifest)
 * @param {string} wasm  - absolute wasm path
 * @param {string[]} initArgs - raw args after `--` (passed straight through)
 * @param {string} initFn - the function to invoke after deploy (default: "initialize")
 * @returns {string} the new contract ID
 */
function deployAndInit(ctx, crate, wasm, initArgs, initFn = 'initialize') {
  const existing = ctx.manifest.contracts[crate];
  if (existing && !ctx.shouldRedeploy(crate)) {
    logOk(`${crate}: already deployed (manifest) → ${existing}`);
    return existing;
  }
  if (!existsSync(wasm)) {
    throw new Error(`Wasm not found for ${crate}: ${wasm}. Did you forget to build?`);
  }

  logStep(`Deploy ${crate}`);
  const deployOut = run('soroban', [
    'contract',
    'deploy',
    '--wasm',
    wasm,
    '--network',
    ctx.networkCfg.network,
    '--source',
    ctx.identity,
    '--ignore-updates',
  ]);
  const contractId = parseContractId(deployOut.stdout);

  logStep(`Initialize ${crate} (${contractId})`);
  run(
    'soroban',
    [
      'contract',
      'invoke',
      '--id',
      contractId,
      '--network',
      ctx.networkCfg.network,
      '--source',
      ctx.identity,
      '--',
      initFn,
      ...initArgs,
    ],
    { cwd: process.cwd() },
  );

  ctx.manifest.contracts[crate] = contractId;
  ctx.persistManifest();
  logOk(`${crate} → ${contractId}`);
  return contractId;
}

// ── Workspace parsing ─────────────────────────────────────────────────────────

/**
 * Parse `contracts/Cargo.toml` and return the workspace member list, filtering
 * out the libraries that have no `initialize` entry (they're not deployable).
 * We pick on the `[workspace] members = […]` block — same source of truth the
 * build system uses, so we never drift.
 */
function readWorkspaceMembers() {
  const cargoToml = readFileSync(resolve(contractsRoot(), 'Cargo.toml'), 'utf8');
  const match = cargoToml.match(/members\s*=\s*\[([\s\S]*?)\]/);
  if (!match) throw new Error('Could not locate `members = [` block in contracts/Cargo.toml');
  // Crude but robust: strip whitespace + quotes + trailing commas.
  const entries = match[1]
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/^"|"$|^'|'$/g, ''))
    .filter(Boolean);
  const deplorable = entries.filter((m) => !['contract-utils', 'harvesta-errors'].includes(m));
  return { crates: deplorable }; // ordered list
}

// ── Per-phase deploy orchestration ────────────────────────────────────────────

/**
 * Each phase returns the contract IDs it produced so later phases can wire
 * them into init args. Throwing out of any phase stops the run; the manifest
 * is preserved as-is so the user can re-run after fixing the issue.
 */
async function runPhases(ctx, tree, deps) {
  // Phase 0: assets (SAC resolution / deployment)
  logPhase('0 — Asset contracts (SAC)');
  ctx.manifest.assets = ctx.manifest.assets ?? {};

  // --only / --skip interaction: phases downstream may need the SAC addresses
  // without we running ensure*. Guard the writes — when the user excluded
  // tree / usdc / stake_token we only consult the manifest (`shouldRun` here
  // means "is the asset slot eligible for re-provisioning this run").
  const treeSac = ctx.shouldRun('sponsor-receipt') || ctx.shouldRun('tree-escrow') || ctx.shouldRun('tree-token')
    ? await ensureTreeToken(ctx, tree)
    : ctx.manifest.assets.tree ?? null;
  const usdcSac = ctx.shouldRun('donation-escrow') || ctx.shouldRun('subscription-sponsorship') || ctx.shouldRun('treasury') || ctx.shouldRun('verifier-staking')
    ? await ensureUsdcToken(ctx)
    : ctx.manifest.assets.usdc ?? null;
  const stakeSac = ctx.shouldRun('verifier-staking')
    ? await ensureStakeToken(ctx, usdcSac ?? ctx.manifest.assets.usdc)
    : ctx.manifest.assets.stake_token ?? null;

  if (treeSac) ctx.manifest.assets.tree = treeSac;
  if (usdcSac) ctx.manifest.assets.usdc = usdcSac;
  if (stakeSac) ctx.manifest.assets.stake_token = stakeSac;
  ctx.manifest.assets.xlm = xlmAddress();
  ctx.persistManifest();

  // Phase 1: admin-controls(admin, oracle)
  logPhase('1 — admin-controls');
  const oracle = ctx.config.overrides['admin-controls']?.oracle ?? deps.oracle;
  if (ctx.shouldRun('admin-controls')) {
    deps.admin_controls = deployAndInit(ctx, 'admin-controls', wasmPath('admin-controls'), [
      '--admin',
      ctx.identityAddress,
      '--oracle',
      oracle,
    ]);
  }

  // Phase 2: registries (each is `initialize(admin: Address)`)
  logPhase('2 — single-admin registries');
  const phase2 = [
    'nullifier-registry',
    'species-registry',
    'farmer-registry',
    'planter-registry',
    'kyc-attestation',
    'location-proof',
    'zk-verifier',
    'zk-location-verifier',
    'escrow-milestone',
    'aggregate-impact-verifier',
  ];
  for (const c of phase2) {
    if (!ctx.shouldRun(c)) continue;
    deps[c] = deployAndInit(ctx, c, wasmPath(c), ['--admin', ctx.identityAddress]);
  }

  // Phase 3: verifier-staking(admin, stake_token, min_stake_amount)
  logPhase('3 — verifier-staking');
  const minStake = ctx.config.overrides['verifier-staking']?.min_stake_amount ?? 100_000_000;
  if (ctx.shouldRun('verifier-staking')) {
    deps.verifier_staking = deployAndInit(ctx, 'verifier-staking', wasmPath('verifier-staking'), [
      '--admin',
      ctx.identityAddress,
      '--stake_token',
      stakeSac,
      '--min_stake_amount',
      String(minStake),
    ]);
  }

  // Phase 4: voting & governance
  logPhase('4 — governance');
  if (ctx.shouldRun('species-voting')) {
    const votingThreshold = ctx.config.overrides['species-voting']?.voting_threshold ?? 10_000_000_000;
    const votingPeriod = ctx.config.overrides['species-voting']?.voting_period_seconds ?? 604800;
    deps.species_voting = deployAndInit(ctx, 'species-voting', wasmPath('species-voting'), [
      '--admin',
      ctx.identityAddress,
      '--tree_token',
      treeSac,
      '--species_registry',
      deps.species_registry,
      '--voting_threshold',
      String(votingThreshold),
      '--voting_period',
      String(votingPeriod),
    ]);
  }

  if (ctx.shouldRun('platform-governance')) {
    const platformFee = ctx.config.overrides['platform-governance']?.platform_fee_percent ?? 5;
    const minBond = ctx.config.overrides['platform-governance']?.min_planting_bond ?? 1_000_000;
    deps.platform_governance = deployAndInit(
      ctx,
      'platform-governance',
      wasmPath('platform-governance'),
      [
        '--admin',
        ctx.identityAddress,
        '--staking_contract',
        deps.verifier_staking,
        '--admin_controls',
        deps.admin_controls,
        '--platform_fee',
        String(platformFee),
        '--min_planting_bond',
        String(minBond),
      ],
    );
  }

  // Phase 5: escrow & payments (NOT tree-escrow yet)
  logPhase('5 — sac-payment escrows & treasury');
  if (ctx.shouldRun('escrow')) {
    deps.escrow = deployAndInit(ctx, 'escrow', wasmPath('escrow'), [
      '--verifier',
      deps.zk_verifier,
    ]);
  }

  for (const [name, args] of [
    [
      'donation-escrow',
      () =>
        // XLM is the native asset; Soroban contracts accept it implicitly.
        // We pass the XLM_TOKEN_ADDRESS env override when provided, otherwise
        // leave --xlm_token off the invocation and let the contract default.
        [
          '--admin',
          ctx.identityAddress,
          '--usdc_token',
          usdcSac ?? ctx.manifest.assets.usdc,
        ].concat(xlmAddress() ? ['--xlm_token', xlmAddress()] : []),
    ],
    [
      'subscription-sponsorship',
      () =>
        [
          '--admin',
          ctx.identityAddress,
          '--usdc_token',
          usdcSac ?? ctx.manifest.assets.usdc,
        ].concat(xlmAddress() ? ['--xlm_token', xlmAddress()] : []),
    ],
  ]) {
    if (!ctx.shouldRun(name)) continue;
    deps[name.replace(/-/g, '_')] = deployAndInit(
      ctx,
      name,
      wasmPath(name),
      args(ctx),
    );
  }

  // treasury(signer_a, signer_b, signer_c, token)
  const signers = {
    a: process.env.TREASURY_SIGNER_A?.trim() || ctx.identityAddress,
    b: process.env.TREASURY_SIGNER_B?.trim() || ctx.identityAddress,
    c: process.env.TREASURY_SIGNER_C?.trim() || ctx.identityAddress,
  };
  if (!(signers.a && signers.b && signers.c)) {
    logWarn(
      'TREASURY_SIGNER_A/B/C not all set: defaulting to the deploy identity for ' +
        'all three signers. Override these on production mainnet deployments.',
    );
  }
  if (ctx.shouldRun('treasury')) {
    deps.treasury = deployAndInit(ctx, 'treasury', wasmPath('treasury'), [
      '--signer_a',
      signers.a,
      '--signer_b',
      signers.b,
      '--signer_c',
      signers.c,
      '--token',
      usdcSac,
    ]);
  }

  // naira-payout(admin, anchor_withdrawal, min_interval_secs, max_daily_payout)
  if (ctx.shouldRun('naira-payout')) {
    const anchor = process.env.NAIRA_ANCHOR_ADDRESS?.trim() || ctx.identityAddress;
    const nairaMin = ctx.config.overrides['naira-payout']?.min_interval_secs ?? 3600;
    const nairaMax = ctx.config.overrides['naira-payout']?.max_daily_payout ?? 100_000_000;
    deps.naira_payout = deployAndInit(ctx, 'naira-payout', wasmPath('naira-payout'), [
      '--admin',
      ctx.identityAddress,
      '--anchor_withdrawal',
      anchor,
      '--min_interval_secs',
      String(nairaMin),
      '--max_daily_payout',
      String(nairaMax),
    ]);
  }

  // Phase 6: tree-escrow + tree-token — special: SAC admin transfer.
  // Atomically skip the whole phase when tree-escrow is filtered out
  // (otherwise steps 6a-6d would race ahead on a stale/undefined id).
  if (!ctx.shouldRun('tree-escrow')) {
    logInfo('Skipping Phase 6 (--skip tree-escrow / --only excludes tree-escrow)');
  } else {
    logPhase('6 — tree-escrow + tree-token (with SAC admin transfer)');
    // Lazily resolve the oracle: Phase 1 may have been skipped (--only),
    // so we accept DEPLOY_ORACLE env var as a fallback before defaulting to
    // the deploy identity's own address (sane for testnet bootstrap).
    const oracleAddr =
      ctx.config.overrides['admin-controls']?.oracle ??
      process.env.DEPLOY_ORACLE?.trim() ??
      ctx.identityAddress;
    const survivalThreshold = ctx.config.overrides['tree-escrow']?.survival_threshold_percent ?? 70;
    const minDensity = ctx.config.overrides['tree-escrow']?.min_density ?? 1000;
    const jobThreshold = ctx.config.overrides['tree-escrow']?.job_size_threshold ?? 10;

    // 6a: Deploy tree-escrow wasm but DO NOT initialize yet — must transfer SAC
    // admin to its address first.
    logStep('Deploy tree-escrow wasm (no init)');
    let treeEscrowId = ctx.manifest.contracts['tree-escrow'];
    const redeployTreeEscrow = !treeEscrowId || ctx.shouldRedeploy('tree-escrow');
    if (redeployTreeEscrow) {
      const out = run('soroban', [
        'contract',
        'deploy',
        '--wasm',
        wasmPath('tree-escrow'),
        '--network',
        ctx.networkCfg.network,
        '--source',
        ctx.identity,
        '--ignore-updates',
      ]);
      treeEscrowId = parseContractId(out.stdout);
      ctx.manifest.contracts['tree-escrow'] = treeEscrowId;
      // Reset the init flag whenever we redeploy; otherwise the new contract
      // never gets initialized and the manifest becomes silently wrong.
      delete ctx.manifest.contracts['tree-escrow-initialized'];
      ctx.persistManifest();
      logOk(`tree-escrow wasm deployed → ${treeEscrowId}`);
    } else {
      logOk(`tree-escrow already deployed → ${treeEscrowId}`);
    }

    // 6b: If we deployed the TREE SAC ourselves, transfer its admin rights to
    //     the tree-escrow contract address. If the SAC was provided via env
    //     (production re-use), skip this — the contract author is responsible
    //     for the transfer.
    if (tree.deployedByUs) {
      logStep(`Transferring TREE SAC admin rights ${treeSac} → ${treeEscrowId}`);
      setSacAdmin({
        sacAddress: treeSac,
        newAdmin: treeEscrowId,
        identity: ctx.identity,
        network: ctx.networkCfg.network,
      });
    } else {
      logWarn(
        `TREE SAC was provided externally (${treeSac}); operator MUST ensure tree-escrow's address is its admin before re-running.`,
      );
    }

    // 6c: Now initialize tree-escrow (the admin check passes because we just
    //     transferred admin rights).
    if (!ctx.manifest.contracts['tree-escrow-initialized']) {
      run('soroban', [
        'contract',
        'invoke',
        '--id',
        treeEscrowId,
        '--network',
        ctx.networkCfg.network,
        '--source',
        ctx.identity,
        '--',
        'initialize',
        '--admin',
        ctx.identityAddress,
        '--tree_token',
        treeSac ?? ctx.manifest.assets.tree,
        '--oracle',
        oracleAddr,
        '--survival_threshold_percent',
        String(survivalThreshold),
        '--min_density',
        String(minDensity),
        '--job_size_threshold',
        String(jobThreshold),
      ]);
      ctx.manifest.contracts['tree-escrow-initialized'] = true;
      ctx.persistManifest();
      logOk(`tree-escrow initialized ${treeEscrowId}`);
    }
    deps.tree_escrow = treeEscrowId;

    // 6d: tree-token(admin, tree_token)
    if (ctx.shouldRun('tree-token')) {
      deployAndInit(ctx, 'tree-token', wasmPath('tree-token'), [
        '--admin',
        ctx.identityAddress,
        '--tree_token',
        treeSac ?? ctx.manifest.assets.tree,
      ]);
    }
  }

  // Phase 7: sponsor-receipt (soulbound NFT receipt, see Closes #471)
  logPhase('7 — sponsor-receipt');
  if (ctx.shouldRun('sponsor-receipt')) {
    deployAndInit(ctx, 'sponsor-receipt', wasmPath('sponsor-receipt'), [
      '--admin',
      ctx.identityAddress,
    ]);
  }
}

// ── Asset helpers ─────────────────────────────────────────────────────────────

async function ensureTreeToken(ctx, tree) {
  const provided = getProvidedAddress('TREE_TOKEN_ADDRESS');
  if (provided) {
    tree.deployedByUs = false;
    return provided;
  }
  if (!ctx.config.assets?.tree?.deploy_if_missing) {
    throw new Error(
      'No TREE_TOKEN_ADDRESS env var and assets.tree.deploy_if_missing=false. ' +
        'Either supply TREE_TOKEN_ADDRESS or enable deploy_if_missing in deploy.config.json.',
    );
  }
  const { sacAddress } = await deployAssetSac({
    network: ctx.networkCfg.network,
    identity: ctx.identity,
    assetCode: 'TREE',
    lockIssuer: ctx.config.assets?.tree?.lock_issuer === true,
  });
  tree.deployedByUs = true;
  return sacAddress;
}

async function ensureUsdcToken(ctx) {
  // usdcAddress() throws on networks where we don't ship a default
  // reference USDC. On those, operators MUST set USDC_TOKEN_ADDRESS.
  try {
    return usdcAddress(ctx.networkCfg.network);
  } catch (e) {
    throw new Error(`USDC asset resolution failed: ${e.message}`);
  }
}

async function ensureStakeToken(ctx, usdcSac) {
  const provided = getProvidedAddress('STAKE_TOKEN_ADDRESS');
  if (provided) return provided;
  const fallback = ctx.config.assets?.stake_token?.default_to;
  if (fallback === 'usdc') return usdcSac;
  throw new Error('No STAKE_TOKEN_ADDRESS env var; set it or configure assets.stake_token.default_to');
}

// ── Identity address resolution ───────────────────────────────────────────────

async function resolveIdentityAddress(ctx) {
  const out = run('soroban', [
    'keys',
    'address',
    ctx.identity,
    '--network',
    ctx.networkCfg.network,
  ]);
  // Output is either "G…" (Stellar account) or "C…" (Soroban contract alias).
  const addr = out.stdout.trim().split(/\s+/).pop();
  if (!addr) throw new Error(`Could not resolve address for identity ${ctx.identity}`);
  ctx.identityAddress = addr;
  logInfo(`Identity address: ${addr}`);
  return addr;
}

// ── Manifest scaffold ─────────────────────────────────────────────────────────

function emptyManifest(cfg) {
  return {
    schema_version: 1,
    network: cfg.network,
    deployed_at: new Date().toISOString(),
    rpc_url: cfg.networkCfg.rpcUrl,
    horizon_url: cfg.networkCfg.horizonUrl,
    identity: cfg.identity,
    identity_address: cfg.identityAddress ?? null,
    assets: {},
    contracts: {},
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const cfg = mergeConfig(opts.config ? loadConfig(opts.config) : {});
  cfg.network = opts.network ?? cfg.network ?? 'testnet';
  cfg.identity = opts.identity ?? cfg.identity;
  if (!cfg.identity) throw new Error('No identity supplied via --identity or config.');
  cfg.networkCfg = networkConfig(cfg.network);
  cfg.skip = new Set([...(cfg.skip ?? []), ...(opts.skip ?? [])]);
  cfg.only = new Set([...(cfg.only ?? []), ...(opts.only ?? [])]);

  ensureDeploymentsDir();

  logStep(`Network: ${cfg.network}`);
  logStep(`Identity: ${cfg.identity}`);

  assertPrerequisites();
  assertIdentityConfigured(cfg.identity);

  const tree = { deployedByUs: false };
  const existing = readManifest(cfg.network);
  if (existing && existing.identity && existing.identity !== cfg.identity && !opts.force) {
    throw new Error(
      `Manifest at ${manifestPath(cfg.network)} was deployed with identity ` +
        `${existing.identity}; current run uses ${cfg.identity}. ` +
        'Use --force to deploy anyway (this will not overwrite addresses already in the manifest).',
    );
  }

  const workspace = readWorkspaceMembers();
  await buildWorkspace(workspace, opts);

  if (opts.buildOnly) {
    logOk('Build-only mode; exiting.');
    return;
  }

  // Pre-allocate the manifest early so `persistManifest()` is safe.
  const manifest = existing ?? emptyManifest({ ...cfg, identityAddress: undefined });
  if (!manifest.assets) manifest.assets = {};
  if (!manifest.contracts) manifest.contracts = {};

  const ctx = {
    networkCfg: cfg.networkCfg,
    identity: cfg.identity,
    identityAddress: null,
    config: cfg,
    manifest,
    opts,
    /**
     * Should phase-X iteration process this crate at all?
     * Returns false when the user explicitly excludes the crate via --skip,
     * or when --only is set and the crate isn't on the only-list.
     */
    shouldRun: (crate) => {
      if (cfg.skip.has(crate)) return false;
      if (cfg.only.size > 0 && !cfg.only.has(crate)) return false;
      return true;
    },
    /**
     * Should an already-deployed crate be re-deployed + re-initialised?
     * True on --force or --only. Otherwise honour manifest idempotency.
     */
    shouldRedeploy: (crate) => opts.force || cfg.only.has(crate),
    persistManifest: () => writeManifest(cfg.network, manifest),
  };

  await resolveIdentityAddress(ctx);
  manifest.identity_address = ctx.identityAddress;
  manifest.deployed_at = new Date().toISOString();
  ctx.persistManifest();

  await runPhases(ctx, tree, (ctx.deps = {}));

  // Final summary
  const summary = [
    `Network: ${cfg.network}`,
    `Identity: ${cfg.identity} (${ctx.identityAddress})`,
    `Manifest: ${manifestPath(cfg.network)}`,
    `Contracts: ${Object.keys(manifest.contracts).length} addresses recorded`,
    `Assets: xlm=${manifest.assets.xlm ?? '—'} · usdc=${manifest.assets.usdc} · tree=${manifest.assets.tree} · stake_token=${manifest.assets.stake_token}`,
  ];
  logPhase('Deployment complete');
  for (const line of summary) logInfo(line);
}

main().catch((err) => {
  console.error('');
  console.error(`✖ ${err.message}`);
  if (err?.context?.stdErr) console.error('\n--- last CLI stderr ---', '\n' + err.context.stdErr);
  process.exit(1);
});
