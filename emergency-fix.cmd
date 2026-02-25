@echo off
echo Emergency Fix for CI Lockfile Issue
echo =====================================

REM Kill any vim processes
taskkill /F /IM vim.exe >nul 2>&1
taskkill /F /IM nvim.exe >nul 2>&1

REM Remove git merge files
del /F /Q .git\MERGE_MSG >nul 2>&1
del /F /Q .git\MERGE_HEAD >nul 2>&1
del /F /Q .git\MERGE_MODE >nul 2>&1

REM Reset git state
git reset --hard HEAD

REM Install dependencies and update lockfile
echo Updating pnpm lockfile...
pnpm install

REM Add and commit the lockfile
git add pnpm-lock.yaml
git commit -m "fix: update pnpm lockfile for react-icons dependency"

REM Push changes
git push origin feat/issue-56-comparison-tool

echo.
echo Fix complete! Check CI at:
echo https://github.com/utilityjnr/stellar-app-os/actions
echo.
pause