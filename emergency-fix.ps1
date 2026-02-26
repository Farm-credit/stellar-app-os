Write-Host "Emergency Fix for CI Lockfile Issue" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Kill vim processes
Write-Host "Killing vim processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -match "vim|nvim"} | Stop-Process -Force -ErrorAction SilentlyContinue

# Remove git merge files
Write-Host "Cleaning git merge state..." -ForegroundColor Yellow
Remove-Item ".git\MERGE_MSG" -Force -ErrorAction SilentlyContinue
Remove-Item ".git\MERGE_HEAD" -Force -ErrorAction SilentlyContinue
Remove-Item ".git\MERGE_MODE" -Force -ErrorAction SilentlyContinue

# Reset git state
Write-Host "Resetting git state..." -ForegroundColor Yellow
git reset --hard HEAD

# Update lockfile
Write-Host "Updating pnpm lockfile..." -ForegroundColor Yellow
pnpm install

if ($LASTEXITCODE -eq 0) {
    Write-Host "Lockfile updated successfully!" -ForegroundColor Green
    
    # Commit changes
    Write-Host "Committing changes..." -ForegroundColor Yellow
    git add pnpm-lock.yaml
    git commit -m "fix: update pnpm lockfile for react-icons dependency"
    
    # Push changes
    Write-Host "Pushing to remote..." -ForegroundColor Yellow
    git push origin feat/issue-56-comparison-tool
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "SUCCESS! CI should now pass." -ForegroundColor Green
        Write-Host "Check CI status at: https://github.com/utilityjnr/stellar-app-os/actions" -ForegroundColor Blue
        Write-Host ""
        Write-Host "Next step: Create PR at:" -ForegroundColor Cyan
        Write-Host "https://github.com/utilityjnr/stellar-app-os/pull/new/feat/issue-56-comparison-tool" -ForegroundColor Blue
    } else {
        Write-Host "Push failed. Please check git status." -ForegroundColor Red
    }
} else {
    Write-Host "pnpm install failed. Please check for errors." -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")