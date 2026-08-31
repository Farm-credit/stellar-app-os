#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Bash entry point for the Soroban/Stellar deploy orchestrator.
#
# Usage:
#   scripts/deploy.sh [network] [identity] [extra args passed to orchestrate.mjs]
#
# Examples:
#   scripts/deploy.sh testnet admin
#   scripts/deploy.sh mainnet ops --only carbon-marketplace --force
#   scripts/deploy.sh futurenet admin --skip verifier-staking
#
# The actual work lives in scripts/orchestrate.mjs. This wrapper only:
#   1. asserts prerequisites (node ≥18, soroban, stellar, cargo),
#   2. loads .env.deploy if present,
#   3. sets DEPLOY_NETWORK/DEPLOY_IDENTITY from positional args,
#   4. execs `node scripts/orchestrate.mjs "$@"`.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Allow opting out of color output for CI logs.
export NO_COLOR="${NO_COLOR:-1}"

NETWORK="${1:-${DEPLOY_NETWORK:-testnet}}"
IDENTITY="${2:-${DEPLOY_IDENTITY:-admin}}"

# Shift the first two positional args so we can forward the rest transparently.
# POSIX-safe: if there are fewer than 2 args, shift to "$#" (no-op); otherwise
# shift 2. Either way the script continues without `set -e` killing us.
if [ "$#" -ge 2 ]; then
  shift 2
else
  shift "$#"
fi

if [ -f "$REPO_ROOT/.env.deploy" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env.deploy"
  set +a
fi

# Wipe DEPLOY_NETWORK/DEPLOY_IDENTITY from .env so the explicit args win.
DEPLOY_NETWORK="$NETWORK"
DEPLOY_IDENTITY="$IDENTITY"
export DEPLOY_NETWORK DEPLOY_IDENTITY

# Run the Node orchestrator.
exec node "$REPO_ROOT/scripts/orchestrate.mjs" \
  --network "$NETWORK" \
  --identity "$IDENTITY" \
  "$@"
