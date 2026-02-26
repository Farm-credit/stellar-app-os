@echo off
echo === Fixing pnpm lockfile issue ===
echo.

echo [1/4] Killing any blocking processes...
taskkill /F /IM vim.exe >nul 2>&1
taskkill /F /IM nvim.exe >nul 2>&1

echo [2/4] Cleaning git state...
del /F /Q .git\MERGE_HEAD >nul 2>&1
del /F /Q .git\MERGE_MSG >nul 2>&1
git reset --hard HEAD >nul 2>&1

echo [3/4] Updating pnpm lockfile...
pnpm install --no-frozen-lockfile

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: pnpm install failed
    pause
    exit /b 1
)

echo [4/4] Committing and pushing...
git add pnpm-lock.yaml
git commit -m "chore: update pnpm lockfile for react-icons dependency"
git push origin feat/issue-56-comparison-tool

if %ERRORLEVEL% EQU 0 (
    echo.
    echo SUCCESS! CI should now pass.
    echo Check: https://github.com/utilityjnr/stellar-app-os/actions
    echo.
    echo Next: Create PR at:
    echo https://github.com/utilityjnr/stellar-app-os/pull/new/feat/issue-56-comparison-tool
) else (
    echo ERROR: Push failed
)

echo.
pause