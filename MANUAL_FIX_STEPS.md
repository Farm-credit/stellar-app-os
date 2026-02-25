# Manual Steps to Fix CI

## Current Issue
The CI is failing with: `ERR_PNPM_OUTDATED_LOCKFILE - Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date`

This is because `react-icons@^5.5.0` was added to package.json but the lockfile wasn't updated.

## Quick Fix (5 Steps)

### Step 1: Close Any Open Editors
If you have a vim or text editor open in the terminal:
- Press `ESC` key
- Type `:q!` (colon, q, exclamation mark)
- Press `ENTER`

Or simply close the terminal window and open a new one.

### Step 2: Navigate to Project
```powershell
cd C:\Users\Dell\Documents\stellar-app-os
```

### Step 3: Clean Git State
```powershell
# Abort any pending merge
git merge --abort

# Reset to clean state  
git reset --hard HEAD

# Pull latest changes (use --no-edit to avoid editor)
git pull origin feat/issue-56-comparison-tool --no-edit
```

### Step 4: Update Lockfile
```powershell
# Install pnpm if not already installed
npm install -g pnpm

# Update the lockfile
pnpm install
```

This will:
- Read package.json
- Install react-icons and all dependencies
- Update pnpm-lock.yaml with the correct versions

### Step 5: Commit and Push
```powershell
# Stage the lockfile
git add pnpm-lock.yaml

# Commit the change
git commit -m "chore: update pnpm lockfile for react-icons dependency"

# Push to remote
git push origin feat/issue-56-comparison-tool
```

## Verify Fix

1. Go to GitHub Actions: https://github.com/utilityjnr/stellar-app-os/actions
2. Find the latest workflow run for your branch
3. Wait for it to complete
4. Should see ✅ green checkmarks

## Alternative: Use PowerShell Script

Run the automated script:
```powershell
.\fix-ci-lockfile.ps1
```

## After CI Passes

Create the PR:
1. Go to: https://github.com/utilityjnr/stellar-app-os/pull/new/feat/issue-56-comparison-tool
2. Copy content from `PR_COMPARISON_TOOL.md`
3. Submit PR

## Troubleshooting

### If pnpm install fails
```powershell
# Clear pnpm cache
pnpm store prune

# Try again
pnpm install
```

### If git push fails
```powershell
# Check status
git status

# If behind remote, pull first
git pull origin feat/issue-56-comparison-tool --rebase

# Then push
git push origin feat/issue-56-comparison-tool
```

### If still having issues
```powershell
# Start fresh in new terminal
cd C:\Users\Dell\Documents\stellar-app-os
git checkout feat/issue-56-comparison-tool
git reset --hard origin/feat/issue-56-comparison-tool
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: update pnpm lockfile"
git push origin feat/issue-56-comparison-tool
```

## Expected Result

After following these steps:
- ✅ pnpm-lock.yaml will be updated
- ✅ CI will pass
- ✅ PR will be ready for review
- ✅ Feature can be merged

## Need Help?

Check these files:
- `FIX_CI.md` - Detailed explanation
- `fix-ci-lockfile.ps1` - Automated script
- `CREATE_PR_INSTRUCTIONS.md` - PR creation guide
