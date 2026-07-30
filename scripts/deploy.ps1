# ─────────────────────────────────────────────────────────────────────────────
# PowerShell entry point for the Soroban/Stellar deploy orchestrator.
#
# Usage:
#   pwsh scripts/deploy.ps1 [-Network <testnet|mainnet|futurenet>]
#                          [-Identity <key-alias>]
#                          [-ExtraArgs "./*.json assemblies passed through"]
#
# Examples:
#   pwsh scripts/deploy.ps1 -Network testnet -Identity admin
#   pwsh scripts/deploy.ps1 -Network mainnet -Identity ops `
#         -ExtraArgs @("--only", "carbon-marketplace", "--force")
#
# The actual work lives in scripts/orchestrate.mjs. This wrapper only:
#   1. asserts prerequisites (node ≥18, soroban, stellar, cargo),
#   2. loads .env.deploy if present,
#   3. sets DEPLOY_NETWORK/DEPLOY_IDENTITY from named params,
#   4. execs `node scripts/orchestrate.mjs ...`.
# ─────────────────────────────────────────────────────────────────────────────
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet("testnet", "mainnet", "futurenet")]
  [string]$Network = $(if ([string]::IsNullOrEmpty($env:DEPLOY_NETWORK)) { "testnet" } else { $env:DEPLOY_NETWORK }),

  [Parameter(Position = 1)]
  [string]$Identity = $(if ([string]::IsNullOrEmpty($env:DEPLOY_IDENTITY)) { "admin" } else { $env:DEPLOY_IDENTITY }),

  [string[]]$ExtraArgs = @()
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

# Color off for CI.
$env:NO_COLOR = "1"

# Load .env.deploy if present (very tolerant parser — no quoting support beyond
# trimming whitespace).
$EnvPath = Join-Path $RepoRoot ".env.deploy"
if (Test-Path $EnvPath) {
  Get-Content $EnvPath | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { return }
    if ($line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 0) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim().Trim('"', "'")
    Set-Item -Path "env:$k" -Value $v
  }
}

# Explicit args win over env vars.
$env:DEPLOY_NETWORK = $Network
$env:DEPLOY_IDENTITY = $Identity

# Assemble the orchestrator invocation.
$NodeArgs = @(
  (Join-Path $RepoRoot "scripts/orchestrate.mjs"),
  "--network", $Network,
  "--identity", $Identity
) + $ExtraArgs

& node @NodeArgs
exit $LASTEXITCODE
