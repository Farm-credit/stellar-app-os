# Contributing to FarmCredit

Welcome to FarmCredit! This guide explains how to contribute to our decentralized agricultural credit platform built on the Stellar network.

**New contributor?** You should be able to go from `git clone` to a merged PR in under 30 minutes by following this guide.

---

## Table of Contents

1. [Welcome & Project Overview](#welcome--project-overview)
2. [Prerequisites](#prerequisites)
3. [Local Development Setup](#local-development-setup)
4. [Git Hooks & Quality Gates](#git-hooks--quality-gates)
5. [Project Architecture](#project-architecture)
6. [Coding Standards](#coding-standards)
7. [Commit Conventions](#commit-conventions)
8. [Pull Request Process](#pull-request-process)
9. [Issue Workflow](#issue-workflow)
10. [Code Review Guidelines](#code-review-guidelines)

---

## Welcome & Project Overview

### What is FarmCredit?

FarmCredit is a decentralized agricultural credit platform enabling farmers and agricultural businesses to access credit through blockchain-based mechanisms. We're building on the [Stellar network](https://stellar.org), enabling fast, low-cost, and accessible financial services for agricultural communities.

### Why Stellar?

- **Fast Transactions** — Sub-second settlement times
- **Low Fees** — Minimal transaction costs
- **Accessibility** — Open, permissionless network
- **Compliance** — Built with regulatory frameworks in mind

### Tech Stack

| Layer               | Technology                                                                                                          | Version  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| **Framework**       | [Next.js](https://nextjs.org) (App Router)                                                                          | 16.1.6   |
| **Language**        | [TypeScript](https://www.typescriptlang.org) (strict mode)                                                          | 5.x      |
| **Styling**         | [Tailwind CSS](https://tailwindcss.com) v4 + [shadcn/ui](https://ui.shadcn.com)                                     | 4.x      |
| **Blockchain**      | [@stellar/stellar-sdk](https://developers.stellar.org/docs/build/sdks/js-stellar-sdk)                               | 11.2.2   |
| **Wallet**          | [@stellar/freighter-api](https://developers.stellar.org/docs/build/apps/smart-contracts/guides/freighter-api)       | 1.7.0    |
| **Design System**   | Stellar brand colors + atomic design pattern                                                                        | Custom   |
| **Package Manager** | [pnpm](https://pnpm.io)                                                                                             | 10.28.1+ |

### Stellar Color Tokens

Our design system uses brand colors available as Tailwind classes:

| Token          | Value     | Tailwind Class                             |
| -------------- | --------- | ------------------------------------------ |
| Stellar Blue   | `#14B6E7` | `bg-stellar-blue`, `text-stellar-blue`     |
| Stellar Purple | `#3E1BDB` | `bg-stellar-purple`, `text-stellar-purple` |
| Stellar Navy   | `#0D0B21` | `bg-stellar-navy`, `text-stellar-navy`     |
| Stellar Cyan   | `#00C2FF` | `bg-stellar-cyan`, `text-stellar-cyan`     |
| Stellar Green  | `#00B36B` | `bg-stellar-green`, `text-stellar-green`   |

---

## Prerequisites

You'll need these installed to contribute:

- **Node.js 20+** — [Download](https://nodejs.org)

  ```bash
  node --version  # Should be v20 or higher
  ```

- **pnpm 10.28.1+** — Install globally:

  ```bash
  npm install -g pnpm@10.28.1
  pnpm --version
  ```

- **Git** — [Download](https://git-scm.com)

  ```bash
  git --version
  ```

- **Basic Stellar Knowledge** (optional for wallet features)
  - Familiar with [Stellar network concepts](https://developers.stellar.org/docs/learn/fundamentals)
  - Have tested Stellar on [testnet](https://stellar.expert/explorer/testnet/) (future wallet features)

### Editor Setup (Recommended)

We recommend **VS Code** with these extensions:

- **ES7+ React/Redux/React-Native snippets** — `dsznajder.es7-react-js-snippets`
- **Prettier - Code formatter** — `esbenp.prettier-vscode`
- **ESLint** — `dbaeumer.vscode-eslint`
- **Tailwind CSS IntelliSense** — `bradlc.vscode-tailwindcss`

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Farm-credit/stellar-app-os.git
cd stellar-app-os
```

### 2. Install Dependencies

```bash
pnpm install
```

This installs all dependencies and automatically sets up Husky git hooks via the `prepare` script.

### 3. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Environment Variables

```bash
cp .env.example .env.local
```

Most features work without environment variables. When adding features requiring external services, document them in `.env.example`.

### 5. Verify Everything Works

```bash
pnpm build    # Type checking + full build
pnpm lint     # Code quality
pnpm generate-icons  # PWA icons (only if modifying app icon)
```

All commands should pass without errors.

### Common Gotchas

**Problem:** `pnpm: command not found`
- **Solution:** `npm install -g pnpm` and restart terminal

**Problem:** `Node.js version is too old`
- **Solution:** Use `nvm` or `fnm` to install Node.js 20+
  ```bash
  nvm install 20
  nvm use 20
  ```

**Problem:** `ModuleNotFoundError` after git pull
- **Solution:** `pnpm install`

**Problem:** Hot reload not working
- **Solution:** Clear Next.js cache and restart
  ```bash
  rm -rf .next
  pnpm dev
  ```

**Problem:** TypeScript errors in IDE but `pnpm build` passes
- **Solution:** Restart TypeScript server — `Ctrl+Shift+P` → `TypeScript: Restart TS Server`

---

## Git Hooks & Quality Gates

This project uses [Husky](https://typicode.github.io/husky/) to enforce quality gates locally. Hooks are installed automatically when you run `pnpm install`.

**You should never need to configure anything manually.** The hooks run silently in the background on every commit and push.

### pre-commit

Runs [lint-staged](https://github.com/lint-staged/lint-staged) before every commit. Only staged `.ts` and `.tsx` files are checked — keeping it fast regardless of codebase size.

What it does:
- Runs ESLint and auto-fixes any fixable issues
- Runs Prettier and auto-formats the file

If either fails with unfixable errors, the commit is blocked. Fix the reported errors and try again.

### commit-msg

Validates your commit message against [Conventional Commits](https://www.conventionalcommits.org/) using `commitlint`. If the format is wrong, the commit is rejected immediately with a clear error.

See [Commit Conventions](#commit-conventions) for the full format spec.

### pre-push

Runs `pnpm build` before every push. If the build fails, the push is blocked.

This is the hard gate — broken code must never reach the remote. Fix all build and type errors locally before pushing.

### Bypassing Hooks (emergency only)

```bash
git commit --no-verify -m "chore: emergency fix"
git push --no-verify
```

Use `--no-verify` only when absolutely necessary. CI will still enforce all checks on the remote.

---

## Project Architecture

### Atomic Design Pattern

Components are organized by complexity, not by feature:

```
components/
├── atoms/           # Smallest, single-purpose elements
├── molecules/       # Combinations of atoms
├── organisms/       # Complex sections
├── templates/       # Page-level layouts
├── providers/       # Context providers
└── ui/              # shadcn/ui base components
```

#### Atoms

Smallest building blocks — typically map 1:1 to a single UI concept.

**Examples:** `Button.tsx`, `Input.tsx`, `Badge.tsx`, `Text.tsx`

```tsx
import { Button } from '@/components/atoms/Button';
```

#### Molecules

Combinations of atoms forming distinct UI units.

**Examples:** `Card.tsx`, `FormField.tsx`, `BlogCard.tsx`

#### Organisms

Complex sections combining atoms and molecules — usually feature-specific.

**Examples:** `Header.tsx`, `WalletConnectionStep/`, `ComparisonTable.tsx`

#### Templates

Page-level structural layouts — typically one per major page type.

**Location:** `components/templates/`

#### UI (shadcn/ui Base Components)

Provided by shadcn/ui. Do not edit directly unless extending with Stellar variants.

**Location:** `components/ui/`

### Design Hierarchy

```
┌─────────────────────────────────────┐
│        Templates (Pages)            │
│  ┌───────────────────────────────┐  │
│  │    Organisms (Features)       │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │  Molecules (Units)      │  │  │
│  │  │  ┌───────────────────┐  │  │  │
│  │  │  │  Atoms (Elements) │  │  │  │
│  │  │  └───────────────────┘  │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Directory Structure

```
stellar-app-os/
├── app/                      # Next.js App Router
│   ├── globals.css           # Stellar tokens + Tailwind config
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Home page
│   ├── api/                  # API routes
│   ├── dashboard/            # Dashboard pages
│   ├── credits/              # Credit features
│   └── settings/             # User settings
├── components/               # All UI components (atomic design)
├── contexts/                 # React contexts
├── hooks/                    # Custom React hooks
├── lib/                      # Utilities, types, schemas, API clients
├── public/                   # Static assets, PWA manifest, icons
└── scripts/                  # Build and utility scripts
```

### Import Convention

Always import directly from the component file. Never use barrel exports (`index.ts`).

```tsx
// ✅ Correct
import { Button } from '@/components/atoms/Button';
import { useWallet } from '@/hooks/useWallet';

// ❌ Wrong
import { Button } from '@/components/atoms';
import { useWallet } from '@/hooks';
```

Why: explicit imports enable better tree-shaking, clearer dependencies, and easier refactoring.

---

## Coding Standards

### TypeScript Strict Mode

This project uses TypeScript **strict mode**. No escape hatches.

```tsx
// ❌ Wrong
const handleClick = (e: any) => { ... };

// ✅ Correct
const handleClick = (e: ChangeEvent<HTMLInputElement>) => { ... };
```

Never leave variables unused. Never use `any`.

### Component Patterns

#### Use `forwardRef` for DOM-forwarding Components

```tsx
import { forwardRef, InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, ...props }, ref) => (
    <div>
      <label>{label}</label>
      <input ref={ref} {...props} />
      {error && <span className="text-red-500">{error}</span>}
    </div>
  )
);

Input.displayName = 'Input';
```

Always set `displayName`. Always export the props interface.

### Naming Conventions

| Type                 | Convention                       | Example                          |
| -------------------- | -------------------------------- | -------------------------------- |
| **Components**       | `PascalCase`                     | `WalletConnectionStep`           |
| **Component Folders**| `PascalCase`                     | `WalletConnectionStep/`          |
| **Other Folders**    | `kebab-case`                     | `lib/api`, `scripts`             |
| **Functions**        | `camelCase`                      | `handleSubmit`, `formatBalance`  |
| **Constants**        | `SCREAMING_SNAKE_CASE`           | `MAX_AMOUNT`, `API_BASE_URL`     |
| **Types/Interfaces** | `PascalCase`                     | `WalletBalance`                  |
| **Files (non-component)** | `kebab-case`                | `use-wallet.ts`                  |

### Styling with Tailwind CSS + shadcn/ui

Always use Stellar color tokens — never arbitrary Tailwind colors:

```tsx
// ✅ Correct
<header className="bg-stellar-navy text-stellar-blue">

// ❌ Wrong
<header className="bg-blue-600 text-blue-400">
```

Use `cn()` for conditional classes:

```tsx
import { cn } from '@/lib/utils';

<div className={cn('rounded-lg border p-4', className)} />
```

---

## Commit Conventions

This project enforces **Conventional Commits** and **atomic commits**. Every commit must be meaningful, buildable, and revertable.

The `commit-msg` hook will reject any commit that doesn't match the format below.

### Commit Message Format

```
<type>(<scope>): <short description>

[optional body — explain WHY and HOW]

[optional footer — breaking changes or issue refs]
```

### Allowed Types

| Type         | When to use                            |
| ------------ | -------------------------------------- |
| `feat`       | New feature or component               |
| `fix`        | Bug fix                                |
| `docs`       | Documentation only                     |
| `style`      | Formatting, no logic change            |
| `refactor`   | Code restructuring, no behavior change |
| `perf`       | Performance improvement                |
| `test`       | Adding or updating tests               |
| `build`      | Build system or dependency changes     |
| `ci`         | CI configuration changes               |
| `chore`      | Maintenance tasks                      |

### Allowed Scopes

`auth` · `wallet` · `dashboard` · `marketplace` · `admin` · `donation` · `carbon` · `ui` · `layout` · `nav` · `config` · `deps`

### Examples

```bash
feat(wallet): add freighter connection flow
fix(auth): handle expired session tokens
docs(config): update environment variable reference
chore(deps): upgrade TypeScript to 5.3.3
```

### Commit Message Template

Configure Git to use the provided template:

```bash
git config commit.template .gitmessage
```

### Atomic Commit Rules

#### Rule 1: One Concern Per Commit

```bash
# ❌ Bad
feat: add dashboard with tabs, fix header bug, update colors

# ✅ Good
feat(dashboard): create page layout
fix(header): correct active link highlighting
```

#### Rule 2: Each Commit Must Build

Every commit in history must pass `pnpm build && pnpm lint`. No debugging code, no unused imports.

#### Rule 3: Each Commit Must Be Revertable

Reverting one commit must not break unrelated features. Build in logical order: foundation → features → polish.

#### How to Stage Atomically

```bash
# Stage specific files
git add app/page.tsx

# Or stage interactively by hunk
git add -p
```

---

## Pull Request Process

### Before You Start

```bash
git checkout main
git pull origin main
git checkout -b feat/<issue-number>-<short-description>
```

**Branch naming:**
- `feat/42-wallet-connection-modal`
- `fix/78-donation-validation-bug`
- `docs/107-contributor-guide`

### Before Submitting

```bash
git rebase main       # Rebase onto latest main
pnpm build            # Must pass
pnpm lint             # Must pass
```

### Screen Recording Requirement

**Every PR must include a screen recording** showing your feature working.

- **macOS:** `Cmd+Shift+5` → Record Selected Portion
- **Windows/Linux:** OBS Studio (https://obsproject.com) or built-in recorder

Show: the relevant page loading → user interaction → expected result. 30-60 seconds is ideal.

### PR Template

```markdown
## Summary
<!-- 1-3 sentences: what does this PR do and why? -->

## Related Issue
Closes #<issue-number>

## What Was Implemented
- [ ] ...

## Implementation Details
<!-- Key technical decisions -->

## How to Test
1. Checkout branch
2. pnpm install && pnpm dev
3. Steps to reproduce the feature

## Screenshots / Recording
[Attach here]
```

### PR Requirements

Every PR **must** have:

- ✅ Linked issue (`Closes #<number>`)
- ✅ Screen recording attached
- ✅ Filled PR template
- ✅ Passing CI (build, lint, types)
- ✅ Atomic commits

**PRs missing a screen recording or linked issue will not be reviewed.**

### Review Timeline

- ⏱️ 24-48 hours for initial feedback
- Respond to all comments — make changes or explain decisions
- Re-request review after addressing feedback

---

## Issue Workflow

1. Browse [open issues](https://github.com/Farm-credit/stellar-app-os/issues)
2. Look for labels: `Stellar Wave`, `good-first-issue`, `help-wanted`
3. Check comments to confirm it's unclaimed
4. Comment `I'll work on this` to claim it

Don't start work on an issue someone else has claimed without coordinating first.

### When to Ask for Help

- Unsure about expected behavior → comment on the issue
- Need architectural guidance → ask in the PR
- Conflicting requirements → raise it early, not at review time

---

## Code Review Guidelines

### What Reviewers Look For

- No `any` types or unused variables
- `forwardRef` + `displayName` where appropriate
- Atomic design pattern followed
- Stellar color tokens used (no arbitrary colors)
- Responsive design (mobile-first)
- Atomic, descriptive commits
- Screen recording attached

### How to Respond to Feedback

1. Read every comment carefully
2. Respond to all of them — even if you disagree
3. Push fixes, then reply `Done` or `Fixed in <sha>`
4. Re-request review

| Comment                    | How to Respond                                                  |
| -------------------------- | --------------------------------------------------------------- |
| "This has an `any` type"   | Replace with proper type (`HTMLInputElement`, etc.)             |
| "Missing displayName"      | Add `Component.displayName = "ComponentName"`                   |
| "Use atomic import"        | Change to direct file import                                    |
| "No arbitrary colors"      | Replace `bg-blue-500` with `bg-stellar-blue`                    |
| "Screen recording missing" | Record feature in browser and upload MP4                        |

---

## Getting Help

- 📝 **General questions:** Comment in the relevant issue
- 💬 **Found a bug:** Open a new issue with reproduction steps
- 🔄 **Feature idea:** Discuss in an issue before implementing
- 🤔 **Contributing questions:** Ask in issues or PR comments

---

## License

By contributing to FarmCredit, you agree that your contributions will be licensed under the same license as the project. See [LICENSE](LICENSE) for details.

---

## Thank You! 🙏

Contributing to open-source agriculture software is meaningful work. We appreciate every pull request, issue report, and question. Together, we're building tools for a more equitable agricultural future.

**Happy coding! 🚀**
