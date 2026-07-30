/**
 * Stellar Asset Contract (SAC) deploy/lookup helper.
 *
 * Many of our contracts accept token addresses via `initialize`. Rather than
 * hard-code those into the orchestrator, this module centralises the policy so
 * callers can either:
 *
 *   1. supply an existing SAC address via env var (production deployment
 *      where the asset is already on a public network — typically true for
 *      USDC on mainnet), OR
 *   2. let us deploy a fresh SAC + lock the issuer (testnet bootstrap only),
 *      OR
 *   3. deploy unwrapped (default) and let the caller lock manually if they
 *      want.
 *
 * **CONSTRAINT** — This module deliberately avoids locking the issuer by
 * default because `tree-escrow` and `tree-token` require the contract itself
 * to be the SAC admin for `mint`/`burn` operations to succeed. Locking the
 * issuer account (master weight = 0) on a classic Stellar asset SAC also
 * makes the SAC's `admin()` callsite panic. See
 * `scripts/README.md` → "TREE SAC pitfall" for details. If you have a
 * business requirement to lock the issuer for supply-cap enforcement, use
 * `setLockIssuer(true)` AND switch to a Soroban-native token contract (out
 * of scope for this script).
 */

import { Keypair, Networks } from '@stellar/stellar-sdk';

import { logInfo, logOk, logWarn, run } from './lib/deploy-helpers.mjs';

/**
 * Build the deterministic network config block the orchestrator needs.
 * Centralising it here keeps consistent RPC/Horizon/explorer URLs across
 * both the asset helper and the orchestrator.
 *
 * @param {string} network - one of "testnet" | "mainnet" | "futurenet"
 * @returns {object} config object
 */
export function networkConfig(network) {
  switch (network) {
    case 'testnet':
      return {
        network,
        networkPassphrase: Networks.TESTNET,
        rpcUrl: 'https://soroban-testnet.stellar.org',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        friendbotUrl: 'https://friendbot.stellar.org',
        explorer: 'https://stellar.expert/explorer/testnet',
      };
    case 'mainnet':
      return {
        network,
        networkPassphrase: Networks.PUBLIC,
        rpcUrl: 'https://soroban-mainnet.stellar.org',
        horizonUrl: 'https://horizon-public.stellar.org',
        friendbotUrl: null,
        explorer: 'https://stellar.expert/explorer/public',
      };
    case 'futurenet':
      return {
        network,
        networkPassphrase: Networks.FUTURENET,
        rpcUrl: 'https://rpc-futurenet.stellar.org',
        horizonUrl: 'https://horizon-futurenet.stellar.org',
        friendbotUrl: 'https://friendbot-futurenet.stellar.org',
        explorer: 'https://stellar.expert/explorer/futurenet',
      };
    default:
      throw new Error(`Unknown network: ${network}. Use testnet|mainnet|futurenet.`);
  }
}

/**
 * Look up an existing SAC address. If the env var is already set we just
 * hand it back without invoking any CLI. This is the production path —
 * mainnet USDC is reused, never redeployed.
 *
 * @param {string} envVar - e.g. "TREE_TOKEN_ADDRESS"
 * @returns {string|null} the address, or null if not provided
 */
export function getProvidedAddress(envVar) {
  const value = process.env[envVar]?.trim();
  if (!value) return null;
  if (!/^C[A-Z0-9]{55}$/i.test(value)) {
    throw new Error(
      `Env var ${envVar}=${value} does not look like a Soroban contract address (expected C…).`,
    );
  }
  return value;
}

/**
 * Deploy a TREE-token Stellar Asset Contract.
 *
 * Unlike `deploy-tree-asset.mjs`, this *does not* lock the issuer by default
 * because `tree-escrow` requires the checkout contract itself to be the SAC
 * admin — a locked issuer account cannot transfer admin rights to another
 * contract. The legacy script (kept for backwards compatibility) still does
 * lock the issuer. That UI is intentionally documented as a non-default
 * option here.
 *
 * @param {object} params
 * @param {string} params.network           - "testnet" | "mainnet" | "futurenet"
 * @param {string} params.identity          - soroban/stellar identity issuing the deploy
 * @param {string} params.assetCode         - asset code, e.g. "TREE"
 * @param {boolean} [params.lockIssuer=false] - DO NOT enable unless you've
 *   confirmed the receiving contracts accept an issuer-locked SAC. See
 *   "TREE SAC pitfall" in scripts/README.md.
 * @returns {Promise<{ sacAddress: string, issuerAddress: string }>}
 */
export async function deployAssetSac({ network, identity, assetCode, lockIssuer = false }) {
  if (lockIssuer) {
    logWarn(
      'lockIssuer=true is incompatible with tree-escrow / tree-token. ' +
        'Reconsider unless you have moved to a Soroban-native token contract.',
    );
  }

  const cfg = networkConfig(network);
  logInfo(`Provisioning issuer keypair for SAC <${assetCode}>`);

  // 1. Random issuer keypair funded via friendbot (testnet only) or whatever
  //    the soroban CLI was preconfigured with on mainnet. We never bake the
  //    keypair into the manifest — instead, after the SAC is created, we
  //    transfer admin rights to the tree-escrow contract (called separately
  //    in orchestrate.mjs after tree-escrow has been deployed).
  const issuerKp = Keypair.random();
  await fundIssuer(cfg, issuerKp.publicKey(), identity);

  logInfo(`Deploying SAC for asset code ${assetCode} (issuer ${issuerKp.publicKey().slice(0, 8)}…)`);
  const out = run(
    'soroban',
    [
      'contract',
      'asset',
      'deploy',
      '--asset',
      `${assetCode}:${issuerKp.publicKey()}`,
      '--network',
      cfg.network,
      '--source',
      identity,
    ],
    { cwd: process.cwd() },
  );
  const sacAddress = out.stdout.trim().split('\n').pop().trim();
  logOk(`SAC deployed: ${sacAddress}`);

  if (lockIssuer) {
    logWarn('Locking issuer account: master weight → 0. DO NOT do this unless you know what you are doing.');
    run('stellar', [
      'tx',
      'set-options',
      '--source-account',
      identity,
      '--network',
      cfg.network,
      '--master-weight',
      '0',
      '--sign-with-key',
      identity,
    ]);
  }

  return {
    sacAddress,
    issuerAddress: issuerKp.publicKey(),
  };
}

/**
 * Fund an account via friendbot when on a Stellar test/futurenet. For mainnet
 * the caller must already have a funded issuer account — we never route
 * mainnet through friendbot.
 */
async function fundIssuer(cfg, pk, identity) {
  if (!cfg.friendbotUrl) {
    throw new Error(
      `Network ${cfg.network} has no friendbot; the caller must pre-fund the issuer.\n` +
        'Funding source is set by the deploy operator, not by this script.',
    );
  }
  // We don't write the generated keypair to disk — friendly risk reminder.
  const res = await fetch(`${cfg.friendbotUrl}?addr=${pk}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Friendbot fund failed for ${pk}: ${res.status} — ${body.slice(0, 200)}`);
  }
  logInfo(`Funded ${pk.slice(0, 8)}…`);
}

/**
 * Resolve the USDC contract address for the current network.
 *
 * We intentionally do NOT hardcode any circle issuer metadata — that data
 * rotates and a stale default would be worse than none. Operators must
 * always provide `USDC_TOKEN_ADDRESS`:
 *
 *   • Testnet:  look up via Horizon `/assets` (filter by `USDC:GBBD47…`),
 *               then read `Contract ID` of the SAC wrapper.
 *   • Mainnet:  use Circle's published USDC SAC hash.
 *
 * For convenience we log a one-liner pointing at stellar.expert so operators
 * can resolve the address interactively.
 */
export function usdcAddress(network) {
  const provided = getProvidedAddress('USDC_TOKEN_ADDRESS');
  if (provided) {
    logInfo(`Using provided USDC_TOKEN_ADDRESS: ${provided}`);
    return provided;
  }
  throw new Error(
    `No USDC_TOKEN_ADDRESS set for network ${network}. ` +
      `Resolve the Stellar Asset Contract hash for USDC on ${network} via Horizon ` +
      'or stellar.expert and re-run with USDC_TOKEN_ADDRESS=<C…>.',
  );
}

/**
 * XLM is the native Stellar asset and does not require SAC deployment — but
 * downstream contracts still need an Address to pass in. We deliberately
 * return `null` here and let the caller forward the native SAC hash if they
 * need an explicit Address (typically the wrap-contracts of the network).
 *
 * For now this just relays an env override if one exists (e.g. operators
 * pointing at a custom SAC deployed for testing).
 */
export function xlmAddress() {
  const v = getProvidedAddress('XLM_TOKEN_ADDRESS');
  if (v) return v;
  logInfo('No XLM_TOKEN_ADDRESS supplied; native asset is used implicitly where contracts accept a SAC.');
  return null;
}

/**
 * Convenience that runs `soroban contract invoke` against the deployed
 * TREE SAC to transfer admin rights to `newAdmin`. This command is required
 * BEFORE `tree-escrow` can be initialized (see "TREE SAC pitfall" in
 * scripts/README.md).
 *
 * @param {object} args
 * @param {string} args.sacAddress      the TREE SAC contract address
 * @param {string} args.newAdmin        the destination admin (e.g. tree-escrow address)
 * @param {string} args.identity        local key providing `sac-signer` auth
 * @param {string} args.network         testnet | mainnet | futurenet
 */
export function setSacAdmin({ sacAddress, newAdmin, identity, network }) {
  logInfo(`Transferring SAC admin ${sacAddress} → ${newAdmin}`);
  // The current admin is the issuer; we sign with the identity that owns it.
  run(
    'soroban',
    [
      'contract',
      'invoke',
      '--id',
      sacAddress,
      '--network',
      network,
      '--source',
      identity,
      '--',
      'set_admin',
      '--new_admin',
      newAdmin,
    ],
    { allowFailure: false },
  );
  logOk(`SAC admin transferred to ${newAdmin}`);
}

/**
 * Helper: read the SAC's `admin` field to verify a transfer worked. Uses
 * `soroban contract read` for a non-mutating call.
 */
export function readSacAdmin({ sacAddress, identity, network }) {
  const out = run(
    'soroban',
    [
      'contract',
      'read',
      '--id',
      sacAddress,
      '--network',
      network,
      '--source',
      identity,
      '--',
      'admin',
    ],
    { allowFailure: true },
  );
  const trimmed = (out.stdout || out.stderr || '').trim();
  if (!trimmed) return null;
  // Output looks like: '"GABC..."' or 'CABC...'. Try to extract what looks like
  // either a contract or account address.
  const contractMatch = trimmed.match(/C[A-Z0-9]{55}/);
  if (contractMatch) return contractMatch[0];
  const accountMatch = trimmed.match(/G[A-Z0-9]{55}/);
  return accountMatch ? accountMatch[0] : trimmed.replace(/^"|"$/g, '');
}

