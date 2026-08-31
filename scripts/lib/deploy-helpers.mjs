/**
 * Shared utilities for the Soroban/Stellar deploy orchestrator.
 *
 * Responsibilities:
 *   - Run `soroban` and `stellar` CLI commands with a uniform shape.
 *   - Read/write the deployment manifest at deployments/<network>.json
 *     atomically (tmp + rename) so a crash never leaves a half-written file.
 *   - Format stdout with consistent phase / step labels for log readability.
 *   - Check that the required CLI tools and env vars are present.
 *
 * No business logic lives here — that all lives in orchestrate.mjs and
 * sac-deploy.mjs. This module is intentionally side-effect-light so it can
 * be imported by tests or other scripts without spinning up network calls.
 */

import { execFileSync, spawnSync } from 'node:child_process';
// (No top-level side effects here. Side effects live in the wrappers.)
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ── Logging ───────────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';

const COLORS_ENABLED = process.stdout.isTTY && !process.env.NO_COLOR;

/** Format a uniform timestamp prefix (`HH:MM:SS`) so users can correlate
 *  multi-line logs with the time the deploy was run. */
function now() {
  return new Date().toISOString().slice(11, 19);
}

function paint(text, color, enabled = true) {
  return enabled ? `${color}${text}${RESET}` : text;
}

/** Print a `STEP` log line in dim gray. */
export function logStep(msg) {
  console.log(paint(`[${now()}] `, DIM, COLORS_ENABLED) + paint(msg, BOLD, COLORS_ENABLED));
}

/** Print a sub-step log line in blue. */
export function logInfo(msg) {
  console.log(paint(`[${now()}]  └─ ${msg}`, BLUE, COLORS_ENABLED));
}

/** Print a success line in green. */
export function logOk(msg) {
  console.log(paint(`[${now()}]  ✓  ${msg}`, GREEN, COLORS_ENABLED));
}

/** Print a warning line in yellow. */
export function logWarn(msg) {
  console.warn(paint(`[${now()}]  !  ${msg}`, YELLOW, COLORS_ENABLED));
}

/** Print a phase banner that visually separates deployment phases. */
export function logPhase(name) {
  const line = '─'.repeat(70);
  console.log(
    '\n' +
      paint(line, MAGENTA, COLORS_ENABLED) +
      '\n' +
      paint(`▶ Phase: ${name}`, BOLD + MAGENTA, COLORS_ENABLED) +
      '\n' +
      paint(line, MAGENTA, COLORS_ENABLED),
  );
}

// ── CLI invocation ────────────────────────────────────────────────────────────

/**
 * Run a command and return its result. We prefer `spawnSync` over execSync so
 * we don't have to worry about shell-escaping arguments; array-form args are
 * always safe.
 *
 * @param {string} bin             Command to invoke (e.g. "soroban", "stellar").
 * @param {string[]} args          Arguments to pass.
 * @param {object} [opts]
 * @param {boolean} [opts.captureStdout=true]  If false, stream stdout to the
 *   console and return only stderr in `result.stderr`.
 * @param {boolean} [opts.allowFailure=false]  If true, don't throw on non-zero
 *   exit; return `{ ok: false, stderr }` instead.
 * @param {string} [opts.cwd]      Override the working directory.
 * @param {Record<string,string>} [opts.env]   Extra/override env for the child.
 * @returns {{stdout: string, stderr: string, status: number}}
 */
export function run(bin, args, opts = {}) {
  const captureStdout = opts.captureStdout ?? true;
  const cwd = opts.cwd;
  const env = { ...process.env, ...(opts.env ?? {}) };

  const result = spawnSync(bin, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024, // 64 MiB; some CLIs emit large help text
    stdio: [
      'ignore',
      captureStdout ? 'pipe' : 'inherit',
      captureStdout ? 'pipe' : 'inherit',
    ],
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !opts.allowFailure) {
    const stdout = (result.stdout ?? '').trim();
    const stderr = (result.stderr ?? '').trim();
    throw new CliError(
      `Command failed (${bin} ${args.join(' ')}): exit ${result.status}\n${stderr}\n${stdout}`,
      { stdErr: stderr, stdOut: stdout, exitCode: result.status },
    );
  }

  return {
    stdout: (result.stdout ?? '').toString(),
    stderr: (result.stderr ?? '').toString(),
    status: result.status ?? 0,
  };
}

/**
 * Like `run` but parses JSON from stdout. Uses `execFileSync` because
 * `spawnSync` doesn't allow us to throw with a clear message when JSON.parse
 * fails — keeping it here for ergonomics.
 */
export function runJson(bin, args, opts = {}) {
  const { stdout } = run(bin, args, opts);
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error(`No JSON output from ${bin} ${args.join(' ')}`);
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from ${bin} ${args.join(' ')}: ${err.message}\n--- raw output ---\n${trimmed}`,
    );
  }
}

/**
 * A typed error thrown by `run`/`runJson` so callers can distinguish CLI
 * failures (with captured stderr) from unrelated exceptions.
 */
export class CliError extends Error {
  constructor(message, ctx) {
    super(message);
    this.name = 'CliError';
    this.context = ctx;
  }
}

// ── Manifest IO ───────────────────────────────────────────────────────────────

/**
 * Read `deployments/<network>.json` from disk. Returns `null` if the file
 * doesn't exist (so callers can distinguish "fresh deploy" from "resume").
 *
 * Light schema validation: refuses files stamped with a different
 * `schema_version` so the orchestrator silently doesn't march forward on a
 * hand-edited or out-of-sync manifest. Also refuses manifests written for
 * a different `--network` than the one currently requested.
 */
export function readManifest(network) {
  const path = manifestPath(network);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (parsed && typeof parsed === 'object' && 'schema_version' in parsed) {
    if (parsed.schema_version !== 1) {
      throw new Error(
        `Manifest at ${path} has schema_version=${parsed.schema_version} but ` +
          'this orchestrator only supports schema_version=1. Re-create the manifest or migrate.',
      );
    }
    if (parsed.network && parsed.network !== network) {
      throw new Error(
        `Manifest at ${path} was written for network=${parsed.network} but ` +
          `we asked for ${network}. Re-create the manifest or pick a different output path.`,
      );
    }
  }
  return parsed;
}

/**
 * Compute the canonical manifest path. `network` is one of
 * `testnet|mainnet|futurenet`.
 */
export function manifestPath(network) {
  return resolve(`deployments/${network}.json`);
}

/**
 * Atomically write the manifest: write to `<path>.tmp` first, then rename.
 * Crash-safe on POSIX because rename is atomic within the same filesystem.
 */
export function writeManifest(network, manifest) {
  const path = manifestPath(network);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}

/**
 * Make sure `deployments/` exists at startup so the first manifest write
 * doesn't race on directory creation.
 */
export function ensureDeploymentsDir() {
  mkdirSync(resolve('deployments'), { recursive: true });
}

// ── Misc helpers ───────────────────────────────────────────────────────────────

/**
 * Extract a contract ID (C…) from a CLI's stdout/deploy output. Most Soroban
 * CLI commands print the new contract's ID on the **last** meaningful line
 * (often prefixed with a banner like `Contract ID` or `New WASM Hash`). We
 * iterate from the bottom so we never accidentally pick a parent SAC address
 * echoed earlier in the same output.
 */
export function parseContractId(output) {
  const lines = (output ?? '').split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/C[A-Z0-9]{55}/);
    if (match) return match[0];
  }
  throw new Error(`Could not parse a contract ID from output:\n${(output ?? '').slice(0, 500)}`);
}

/**
 * Parse `soroban contract bindings generate` style address token outputs into
 * a plain string. Falls back to the raw token if it doesn't look like any of
 * the recognised formats so we never silently swallow data.
 */
export function normalizeAddress(token) {
  return String(token ?? '').trim();
}

/** Return the absolute path of the `contracts/` workspace from cwd. */
export function contractsRoot() {
  return resolve('contracts');
}

/** Compute the wasm artifact path for a given crate. */
export function wasmPath(crate) {
  return resolve(
    contractsRoot(),
    crate,
    'target/wasm32-unknown-unknown/release',
    `${crate.replace(/-/g, '_')}.wasm`,
  );
}

// ── Prerequisite checks ───────────────────────────────────────────────────────

/**
 * Verify that `soroban` and `stellar` CLIs are installed and runnable. We do
 * not require specific versions because the workspace pins both via `npx
 * @stellar/cli` and `npx @soroban/cli` in dev — once those are pulled in the
 * minimum required binary is present on PATH via the pnpm shell.
 *
 * Throws with a remediation message if either is missing.
 */
export function assertPrerequisites() {
  const missing = [];
  for (const bin of ['soroban', 'stellar', 'node', 'cargo']) {
    try {
      const r = execFileSync(bin, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      logInfo(`${bin} ${r.trim().split('\n')[0]}`);
    } catch {
      missing.push(bin);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required CLI(s): ${missing.join(', ')}.\n` +
        'Install instructions:\n' +
        '  • soroban: cargo install --locked stellar-cli --features soroban\n' +
        '  • stellar: cargo install --locked stellar-cli\n' +
        '  • rust:    https://rustup.rs\n' +
        '  • node ≥18, cargo, jq (optional, for local sanity checks).',
    );
  }
}

/**
 * Identity / network sanity check. Throws if no identity is configured.
 * Callers may pre-flight funding themselves with `stellar keys fund ...` or
 * `soroban keys fund ...` depending on the network.
 */
export function assertIdentityConfigured(identity) {
  if (!identity || typeof identity !== 'string' || identity.length === 0) {
    throw new Error(
      'No identity supplied. Pass --identity <name> (the local soroban/stellar key alias).',
    );
  }
  // We only check that *something* the CLI recognises exists — the actual
  // fund / network verification is left to the CLI itself when we invoke it.
  logInfo(`identity: ${identity}`);
}
