# Contributing

Thank you for contributing! This document explains the developer tooling that runs automatically to keep the codebase consistent and the CI pipeline green.

---

## Prerequisites

| Tool    | Version |
| ------- | ------- |
| Node.js | ≥ 18    |
| pnpm    | ≥ 9     |

---

## First-time setup

```bash
# 1. Install dependencies – this also runs `husky` via the `prepare` script
pnpm install

# 2. That's it. Git hooks are now active.
```

> **Note:** If you cloned the repo before the hooks were added, or if hooks ever stop running, re-run `pnpm prepare` (which executes `husky`) to re-install them.

---

## Git hooks

Three hooks run automatically on your local machine. They are stored in `.husky/` and are version-controlled alongside the source code.

### `pre-commit` → lint-staged

**Trigger:** Every `git commit`

**What it does:** Runs ESLint (with `--fix`) and Prettier on **staged files only** — nothing else is touched.

**Affected file types:**

| Pattern                                      | Tools             |
| -------------------------------------------- | ----------------- |
| `*.ts`, `*.tsx`                              | ESLint → Prettier |
| `*.js`, `*.jsx`, `*.mjs`, `*.cjs`            | Prettier          |
| `*.json`, `*.md`, `*.yaml`, `*.yml`, `*.css` | Prettier          |

If ESLint reports any warnings or errors after auto-fix, the commit is **aborted**. Fix the issues and stage your changes again before committing.

```
# Example failure message
✖ eslint --fix --max-warnings=0 failed without output (1)
```

### `commit-msg` → commitlint

**Trigger:** Every `git commit` (after you type the message)

**What it does:** Validates your commit message against the [Conventional Commits](https://www.conventionalcommits.org/) spec.

**Required format:**

```
<type>(<optional scope>): <short description>

[optional body]

[optional footer(s)]
```

**Allowed types:**

| Type       | When to use                                        |
| ---------- | -------------------------------------------------- |
| `feat`     | A new feature visible to users                     |
| `fix`      | A bug fix                                          |
| `docs`     | Documentation-only changes                         |
| `style`    | Formatting, whitespace — no logic change           |
| `refactor` | Code change that is neither a fix nor a feature    |
| `perf`     | Performance improvement                            |
| `test`     | Adding or correcting tests                         |
| `build`    | Build system or dependency changes                 |
| `ci`       | CI/CD configuration changes                        |
| `chore`    | Maintenance (e.g. dependency bumps, config tweaks) |
| `revert`   | Reverts a previous commit                          |

**Rules enforced:**

- `type` is required and must be lower-case
- `subject` (the short description) is required and must **not** end with a full stop
- Header (first line) must be ≤ 100 characters
- Body and footer must be separated from the header by a blank line

**Valid examples:**

```
feat(auth): add OAuth2 login with Google
fix(api): handle null response from /users endpoint
docs: update README with local dev instructions
chore(deps): bump next from 14.1.0 to 14.2.0
```

**Invalid examples:**

```
# ❌ Missing type
Add login button

# ❌ Wrong type
update: fix login bug

# ❌ Subject ends with full stop
fix: handle null response.

# ❌ Header too long (> 100 chars)
feat(authentication): add a completely new OAuth2-based login flow using Google and GitHub providers
```

### `pre-push` → `pnpm build`

**Trigger:** Every `git push`

**What it does:** Runs a full `next build` before your code leaves your machine. If the build fails, the push is **aborted**.

This catches TypeScript compilation errors, import errors, and Next.js-specific build issues before they hit CI, saving you (and your teammates) a slow feedback loop.

```
# The hook runs this command:
pnpm build
```

Expect the push to take roughly the same time as your normal build. On a warm cache this is typically 20–60 seconds.

> **Tip:** If you need to push work-in-progress to a personal/draft branch and bypass the build check temporarily, you can use `git push --no-verify`. Use this sparingly — CI will still catch build failures.

---

## Commit message tips

Use your editor for multi-line messages instead of `-m` when you need a body or footer:

```bash
git commit   # opens $EDITOR
```

Or with a body inline:

```bash
git commit -m "feat(dashboard): add monthly revenue chart

Adds a recharts LineChart showing MRR over the last 12 months.
Data is fetched server-side and passed as a prop.

Closes #142"
```

---

## Skipping hooks (emergency only)

```bash
git commit --no-verify   # skips pre-commit and commit-msg
git push --no-verify     # skips pre-push
```

Bypassing hooks is **strongly discouraged** on `main` and release branches. CI enforces the same checks and will fail regardless.

---

## Troubleshooting

**"command not found: husky"** — Run `pnpm install` to reinstall dev dependencies and re-trigger the `prepare` script.

**"lint-staged not found"** — Same fix: `pnpm install`.

**Hook file is not executable** — Husky v9 handles this automatically via `pnpm prepare`. If you're on Windows without Git Bash, ensure you're running Git commands inside a proper shell environment (Git Bash, WSL, or PowerShell with Unix tools).

**ESLint fails on a file I didn't touch** — lint-staged only lints files you've staged. If ESLint is complaining about an unstaged file, it may be imported by a staged file and triggering a project-wide error. Fix the underlying issue or use `// eslint-disable-next-line` with a comment explaining why.
