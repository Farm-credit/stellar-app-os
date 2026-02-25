# Fix CI - Update pnpm Lockfile
# This script fixes the ERR_PNPM_OUTDATED_LOCKFILE error

Write-Host "=== Fixing CI: Updating pnpm lockfile ===" -ForegroundColor Cyan

# Step 1: Abort any pending merge
Write-Host "`n[1/5] Checking for pending merge..." -ForegroundColor Yellow
git merge --abort 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Merge aborted" -ForegroundColor Green
} else {
    Write-Host "✓ No merge in progress" -ForegroundColor Green
}

# Step 2: Reset to clean state
Write-Host "`n[2/5] Resetting to clean state..." -ForegroundColor Yellow
git reset --hard HEAD
Write-Host "✓ Reset complete" -ForegroundColor Green

# Step 3: Pull latest changes
Write-Host "`n[3/5] Pulling latest changes..." -ForegroundColor Yellow
git pull origin feat/issue-56-comparison-tool --no-edit
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Pull successful" -ForegroundColor Green
} else {
    Write-Host "✗ Pull failed - continuing anyway" -ForegroundColor Red
}

# Step 4: Update pnpm lockfile
Write-Host "`n[4/5] Updating pnpm lockfile..." -ForegroundColor Yellow
Write-Host "This will install react-icons and update pnpm-lock.yaml" -ForegroundColor Gray

# Check if pnpm is installed
$pnpmInstalled = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpmInstalled) {
    Write-Host "Installing pnpm globally..." -ForegroundColor Yellow
    npm install -g pnpm
}

# Run pnpm install
pnpm install

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Lockfile updated successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to update lockfile" -ForegroundColor Red
    exit 1
}

# Step 5: Commit and push
Write-Host "`n[5/5] Committing and pushing changes..." -ForegroundColor Yellow
git add pnpm-lock.yaml
git commit -m "chore: update pnpm lockfile for react-icons dependency"
git push origin feat/issue-56-comparison-tool

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ SUCCESS! CI should now pass" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "1. Check CI status on GitHub" -ForegroundColor White
    Write-Host "2. Once CI passes, create PR at:" -ForegroundColor White
    Write-Host "   https://github.com/utilityjnr/stellar-app-os/pull/new/feat/issue-56-comparison-tool" -ForegroundColor Blue
} else {
    Write-Host "`n✗ Push failed - please check git status" -ForegroundColor Red
}

Write-Host "`n=== Script Complete ===" -ForegroundColor Cyan
