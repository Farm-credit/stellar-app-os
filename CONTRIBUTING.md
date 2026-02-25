# Contributing to FarmCredit

Welcome to FarmCredit! This guide explains how to contribute to our decentralized agricultural credit platform built on the Stellar network.

**New contributor?** You should be able to go from `git clone` to a merged PR in under 30 minutes by following this guide.

---

## Table of Contents

1. [Welcome & Project Overview](#welcome--project-overview)
2. [Prerequisites](#prerequisites)
3. [Local Development Setup](#local-development-setup)
4. [Project Architecture](#project-architecture)
5. [Coding Standards](#coding-standards)
6. [Commit Conventions](#commit-conventions)
7. [Pull Request Process](#pull-request-process)
8. [Issue Workflow](#issue-workflow)
9. [Code Review Guidelines](#code-review-guidelines)

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

| Layer               | Technology                                                                                                    | Version  |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| **Framework**       | [Next.js](https://nextjs.org) (App Router)                                                                    | 16.1.6   |
| **Language**        | [TypeScript](https://www.typescriptlang.org) (strict mode)                                                    | 5.x      |
| **Styling**         | [Tailwind CSS](https://tailwindcss.com) v4 + [shadcn/ui](https://ui.shadcn.com)                               | 4.x      |
| **Blockchain**      | [@stellar/stellar-sdk](https://developers.stellar.org/docs/build/sdks/js-stellar-sdk)                         | 11.2.2   |
| **Wallet**          | [@stellar/freighter-api](https://developers.stellar.org/docs/build/apps/smart-contracts/guides/freighter-api) | 1.7.0    |
| **Design System**   | Stellar brand colors + atomic design pattern                                                                  | Custom   |
| **Package Manager** | [pnpm](https://pnpm.io)                                                                                       | 10.28.1+ |

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
- **TypeScript Vue Plugin (Volar)** — `Vue.volar` (if working with Vue components)

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

This installs all dependencies specified in `pnpm-lock.yaml`.

### 3. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Expected output:**

```
  ▲ Next.js 16.1.6
  - Local:        http://localhost:3000
  - Environments: .env.local

✓ Ready in 2.5s
```

### 4. Environment Variables

Create `.env.local` in the repo root:

```bash
cp .env.example .env.local
```

For now, most features work without environment variables. When adding features requiring external services, document them in `.env.example`.

### 5. Verify Everything Works

```bash
# Check type safety
pnpm build

# Check code quality
pnpm lint

# Generate PWA icons (if modifying app icon)
pnpm generate-icons
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

- **Solution:** Dependencies may have changed
  ```bash
  pnpm install
  ```

**Problem:** Hot reload not working

- **Solution:** Clear Next.js cache and restart dev server
  ```bash
  rm -rf .next
  pnpm dev
  ```

**Problem:** TypeScript errors in IDE but `pnpm build` passes

- **Solution:** Restart TypeScript server in VS Code
  - Press `Cmd+Shift+P` (macOS) / `Ctrl+Shift+P` (Windows/Linux)
  - Type `TypeScript: Restart TS Server`

---

## Project Architecture

### Atomic Design Pattern

Components are organized by complexity, not by feature. This enables reusability across pages:

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

**Examples:**

- `Button.tsx` — Pressable element with variants
- `Input.tsx` — Text input field
- `Badge.tsx` — Status indicator
- `Text.tsx` — Typography wrapper

**File structure:**

```
components/atoms/
├── Button.tsx
├── Input.tsx
├── Badge.tsx
└── Text.tsx
```

**Import:**

```tsx
import { Button } from "@/components/atoms/Button";
```

#### Molecules

Combinations of atoms forming distinct UI units.

**Examples:**

- `Card.tsx` — Container combining flexible layout
- `FormField.tsx` — Label + Input + Error message
- `BlogCard.tsx` — Image + Title + Excerpt + Link

**File structure:**

```
components/molecules/
├── Card.tsx
├── FormField.tsx
└── BlogCard.tsx
```

#### Organisms

Complex sections combining atoms and molecules — usually feature-specific.

**Examples:**

- `Header.tsx` — Navigation + Logo + User menu
- `WalletConnectionStep/` — Freighter integration + balance display
- `ComparisonTable.tsx` — Sortable data table

**File structure:**

```
components/organisms/
├── Header/
│   ├── Header.tsx
│   ├── Navigation.tsx
│   └── UserMenu.tsx
├── WalletConnectionStep/
│   └── WalletConnectionStep.tsx
└── ComparisonTable.tsx
```

#### Templates

Page-level structural layouts — typically one per major page type.

**Examples:**

- `DashboardLayout.tsx` — Sidebar + Content area
- `BlogPageTemplate.tsx` — Featured post + Grid + Pagination

**Location:** `components/templates/`

#### UI (shadcn/ui Base Components)

These are provided by shadcn/ui and should not be edited directly unless extending with Stellar variants.

**Location:** `components/ui/`

**Important:** Only import directly; don't re-export from atoms.

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
│   │   ├── health/           # Health check endpoint
│   │   ├── wallet/           # Wallet operations
│   │   └── transaction/      # Transaction handling
│   ├── dashboard/            # Dashboard pages
│   │   └── credits/          # Credits management page
│   ├── credits/              # Credit features
│   │   ├── purchase/         # Purchase page
│   │   └── compare/          # Comparison tool page
│   └── settings/             # User settings
├── components/               # All UI components
│   ├── atoms/                # Base elements
│   ├── molecules/            # Component groups
│   ├── organisms/            # Feature sections
│   ├── templates/            # Page layouts
│   ├── providers/            # Context providers
│   └── ui/                   # shadcn/ui base
├── contexts/                 # React contexts
│   └── WalletContext.tsx     # Wallet state management
├── hooks/                    # Custom React hooks
│   └── useWallet.ts          # Wallet operations hook
├── lib/                      # Utility functions
│   ├── stellar/              # Stellar SDK wrappers
│   │   ├── wallet.ts         # Wallet utilities
│   │   ├── signing.ts        # Transaction signing
│   │   └── transaction.ts    # Transaction utils
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # General utilities
│   ├── api/                  # API client utilities
│   ├── schemas/              # Zod validation schemas
│   └── analytics.ts          # Analytics utilities
├── public/                   # Static assets
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service worker
│   └── icons/                # App icons
└── scripts/                  # Build and utility scripts
    └── generate-icons.mjs    # PWA icon generator
```

### Import Convention

**Rule:** Always import directly from the component file. Never use barrel exports (index.ts).

**Correct:**

```tsx
import { Button } from "@/components/atoms/Button";
import { Card, CardHeader } from "@/components/molecules/Card";
import { useWallet } from "@/hooks/useWallet";
```

**Wrong:**

```tsx
// ❌ Do not use barrel exports
import { Button } from "@/components/atoms";
import { useWallet } from "@/hooks";
```

### Why This Matters

- **Faster builds** — Explicit imports enable better tree-shaking
- **Clear dependencies** — Understanding what a file imports is immediate
- **Easier refactoring** — Moving files doesn't break wildcard imports

---

## Coding Standards

### TypeScript Strict Mode

This project uses TypeScript **strict mode**. No escape hatches.

**Never use `any`:**

```tsx
// ❌ Wrong
const handleClick = (e: any) => {
  console.log(e.target.value);
};

// ✅ Correct
import { ChangeEvent, FC } from "react";

const handleClick = (e: ChangeEvent<HTMLInputElement>) => {
  console.log(e.target.value);
};
```

**Never leave variables unused:**

```tsx
// ❌ Wrong
const { unused, needed } = props;
return <div>{needed}</div>;

// ✅ Correct
const { needed } = props;
return <div>{needed}</div>;
```

### Component Patterns

#### Use `forwardRef` for DOM-forwarding Components

If your component passes a ref to a DOM element, use `forwardRef`:

```tsx
import { forwardRef, InputHTMLAttributes } from "react";

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
  ),
);

Input.displayName = "Input";
```

#### Always Set `displayName`

Required for debugging and React DevTools:

```tsx
export const MyComponent = forwardRef<HTMLDivElement, Props>((props, ref) => (
  <div ref={ref} {...props} />
));

MyComponent.displayName = "MyComponent";
```

#### Export Named Types

Always export the props interface:

```tsx
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", ...props }, ref) => (
    <button ref={ref} className={`btn-${variant} btn-${size}`} {...props} />
  ),
);

Button.displayName = "Button";
```

### Naming Conventions

| Type                 | Convention                       | Example                                |
| -------------------- | -------------------------------- | -------------------------------------- |
| **Components**       | `PascalCase`                     | `WalletConnectionStep`, `DonationForm` |
| **Folders**          | `kebab-case`                     | `wallet-connection`, `donation-form`   |
| **Functions**        | `camelCase`                      | `handleSubmit`, `formatBalance`        |
| **Variables**        | `camelCase`                      | `isLoading`, `accountBalance`          |
| **Constants**        | `SCREAMING_SNAKE_CASE`           | `MAX_AMOUNT`, `API_BASE_URL`           |
| **CSS Classes**      | `kebab-case`                     | `bg-stellar-blue`, `text-sm`           |
| **Types/Interfaces** | `PascalCase`                     | `WalletBalance`, `TransactionDetails`  |
| **Files**            | `kebab-case` (except components) | `use-wallet.ts`, `wallet-utils.ts`     |

### Styling with Tailwind CSS + shadcn/ui

#### Using Stellar Colors

Always use Stellar color tokens defined in `app/globals.css`:

```tsx
// ✅ Correct
export const Header = () => (
  <header className="bg-stellar-navy text-stellar-blue">
    <h1>FarmCredit</h1>
  </header>
);

// ❌ Wrong
export const Header = () => (
  <header className="bg-blue-600 text-blue-400">
    <h1>FarmCredit</h1>
  </header>
);
```

#### Extending shadcn/ui Components

shadcn/ui components in `components/ui/` provide base styles. Wrap them in atoms to add Stellar variants:

```tsx
// components/atoms/Button.tsx
import { Button as BaseButton } from "@/components/ui/button";
import { forwardRef, ButtonHTMLAttributes } from "react";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary";
  }
>(({ variant = "primary", ...props }, ref) => (
  <BaseButton
    ref={ref}
    className={variant === "primary" ? "bg-stellar-blue" : "bg-stellar-purple"}
    {...props}
  />
));

Button.displayName = "Button";
```

#### Use `cn()` for Conditional Classes

The `cn()` utility merges class names while respecting Tailwind precedence:

```tsx
import { cn } from "@/lib/utils";

export const Card = ({ className, ...props }: any) => (
  <div
    className={cn("rounded-lg border bg-white p-4 shadow", className)}
    {...props}
  />
);
```

### Code Quality Checks

Before committing, ensure all checks pass:

```bash
# Type checking
pnpm build

# Linting and formatting
pnpm lint
```

Fix issues automatically when possible:

```bash
pnpm lint --fix
```

---

## Commit Conventions

This project enforces **Conventional Commits** and **atomic commits**. Every commit must be meaningful, buildable, and revertable.

### Commit Message Format

```
<type>(<scope>): <short description>

[optional body describing WHY and HOW]

[optional footer with breaking changes or issue references]
```

### Allowed Types

| Type         | When to use                            | Example                                            |
| ------------ | -------------------------------------- | -------------------------------------------------- |
| **feat**     | New feature or component               | `feat(wallet): add Stellar wallet connection`      |
| **fix**      | Bug fix                                | `fix(donation): correct minimum amount validation` |
| **docs**     | Documentation only                     | `docs(contributing): add commit guidelines`        |
| **style**    | Formatting, no logic change            | `style(button): adjust padding with Prettier`      |
| **refactor** | Code restructuring, no behavior change | `refactor(dashboard): extract tab components`      |
| **perf**     | Performance improvement                | `perf(list): memoize comparison table rows`        |
| **test**     | Adding or updating tests               | `test(wallet): add connection flow tests`          |
| **build**    | Build system or dependency changes     | `build(deps): upgrade Next.js to 16.1.6`           |
| **ci**       | CI configuration changes               | `ci: add GitHub Actions workflow`                  |
| **chore**    | Maintenance tasks                      | `chore: update .gitignore`                         |

### Allowed Scopes

Scopes organize commits by feature area. Use one of:

- `auth` — Authentication features
- `wallet` — Wallet integration (Freighter, connections)
- `dashboard` — Dashboard pages and layout
- `marketplace` — Marketplace/comparison features
- `admin` — Admin-only features
- `donation` — Donation flows
- `carbon` — Carbon credit features
- `ui` — UI components (atoms, molecules, organisms)
- `layout` — Layout and page structure
- `nav` — Navigation components
- `config` — Configuration files
- `deps` — Dependencies and package management

### Commit Message Examples

```bash
# Good feature commit
feat(wallet): add wallet balance display component

# Good fix commit
fix(donation): correct decimal validation for amount input

# Good docs commit
docs(contributing): add branching strategy section

# Good refactor commit
refactor(dashboard): extract credit cards into separate component

# Good chore commit
chore(deps): update TypeScript to 5.3.3
```

### Atomic Commit Rules

These rules ensure your commits are safe and reviewable:

#### Rule 1: One Concern Per Commit

Never mix unrelated changes:

```bash
# ❌ Bad — mixes feature, fix, and styling
feat: add dashboard with tabs, fix header bug, update colors

# ✅ Good — separate commits
feat(dashboard): create page layout
feat(dashboard): add navigation tabs
fix(header): correct active link highlighting
style(colors): update Stellar token usage
```

#### Rule 2: Each Commit Must Build

Every single commit in history must pass:

```bash
pnpm build && pnpm lint
```

This means:

- No temporary debugging code
- All files must type-check
- No unused imports or variables

#### Rule 3: Each Commit Must Be Revertable

Reverting one commit must not break unrelated features:

```bash
# ❌ Bad — commit 2 depends on commit 1
# Commit 1: feat(ui): create Button atom
# Commit 2: feat(wallet): use Button in wallet module
# If someone reverts commit 1, commit 2 breaks

# ✅ Good — clean build at each step
# Commit 1: feat(ui): create Button atom with base styles
# Commit 2: feat(wallet): create wallet module
# Commit 3: feat(wallet): integrate Button component
```

#### Rule 4: Order Matters

Build commits in logical order:

1. **Foundation** — utilities, types, base components
2. **Features** — pages, sections using the foundation
3. **Polish** — styling refinements, performance

**Example good sequence:**

```
1. feat(ui): add Button atom component
2. feat(ui): add Card molecule component
3. feat(dashboard): create dashboard layout
4. feat(dashboard): add overview tab
5. feat(dashboard): add donations tab
6. style(dashboard): align spacing and padding
```

**Example bad sequence:**

```
1. feat(dashboard): create full dashboard with all tabs and styling
2. refactor: extract components into separate files
```

### How to Create Atomic Commits

#### Step 1: Stage Only What You Need

```bash
# Stage specific files
git add app/page.tsx

# Or stage chunks interactively
git add -p  # Choose hunks to stage
```

#### Step 2: Write Descriptive Message

```bash
git commit -m "feat(dashboard): create dashboard page layout"
```

Include a body explaining WHY if not obvious:

```bash
git commit -m "fix(donation): correct amount validation logic

The minimum donation amount wasn't being enforced during form
submission. Added decimal validation using Zod schema before
API call.

Fixes #42"
```

#### Step 3: Verify Build

```bash
pnpm build
pnpm lint
```

#### Step 4: Repeat for Next Logical Unit

```bash
git add components/molecules/DashboardCard.tsx
git commit -m "feat(dashboard): add dashboard card component"
```

---

## Pull Request Process

### Before You Start

1. **Branch from `main`:**

   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/<issue-number>-<short-description>
   ```

2. **Branch Naming Convention:**

   ```
   feat/<issue-number>-<short-description>
   fix/<issue-number>-<short-description>
   docs/<issue-number>-<short-description>
   ```

   **Examples:**
   - `feat/42-wallet-connection-modal`
   - `fix/78-donation-validation-bug`
   - `docs/107-contributor-guide`

### Before Submitting PR

Ensure everything is ready:

```bash
# Update to latest main
git checkout main
git pull origin main
git checkout <your-branch>
git rebase main

# Verify all checks pass
pnpm build          # Type checking
pnpm lint           # Linting
```

Fix any issues:

```bash
pnpm lint --fix     # Auto-fix formatting
```

### Recording Your Implementation

**Important:** Every PR must include a screen recording demonstrating your implementation working.

#### How to Record

**macOS:**

- Press `Cmd+Shift+5`
- Select "Record Selected Portion"
- Record your feature in action
- File saves to Desktop

**Windows/Linux:**

- Use OBS Studio (free): https://obsproject.com
- Or built-in screen recorder

#### What to Show

Record a workflow covering:

1. **Loading** — Start at the relevant page
2. **Interaction** — Use your feature as a user would
3. **Result** — Show the expected outcome

**Example:** For a wallet connection feature:

```
1. Click "Connect Wallet" button
2. Freighter popup opens and user approves
3. Wallet address displays in header
4. Balance loads and updates
```

**Duration:** 30-60 seconds is ideal

### Submitting Your PR

1. **Push your branch:**

   ```bash
   git push origin <your-branch>
   ```

2. **Open PR on GitHub:**
   - Click "Compare & pull request"
   - Fill out the template completely (see below)
   - Attach your screen recording

3. **PR Template Walkthrough:**

```markdown
## Summary

<!-- 1-3 sentences: What does this PR do and why? -->

Implements wallet connection modal allowing users to connect
Freighter wallet. This unblocks the wallet integration feature.

## Related Issue

Closes #42

## What Was Implemented

<!-- Detailed checklist of changes -->

- [x] WalletConnectionStep component created
- [x] Freighter API integration
- [x] Error handling for failed connections
- [x] Success toast notification
- [x] Mobile responsive design
- [x] Accessibility attributes (aria-labels)

## Implementation Details

<!-- Key technical decisions and patterns -->

- Used Freighter API (via @stellar/freighter-api)
- Implemented error boundaries for connection failures
- Stored wallet address in React Context for app-wide access
- Uses Stellar color tokens for styling consistency

## How to Test

1. Checkout this branch: `git checkout feat/42-...`
2. Install and run: `pnpm install && pnpm dev`
3. Navigate to home page
4. Click "Connect Wallet" button
5. Approve connection in Freighter popup
6. Verify wallet address appears in header
7. Test on mobile (DevTools > Toggle device toolbar)

## Screenshots / Recording

[Attach screen recording here]
```

### PR Requirements

Every PR **must** have:

- ✅ **Linked issue** — Use `Closes #<issue-number>` in description
- ✅ **Screen recording** — Attached to PR showing feature working
- ✅ **Filled PR template** — All sections completed
- ✅ **Passing CI** — All checks green (build, lint, types)
- ✅ **Atomic commits** — Each commit can stand alone

**PRs missing a screen recording or linked issue will not be reviewed.**

### Review Expectations & Timeline

After submitting:

- ⏱️ **24-48 hours** — Expect initial review feedback
- 💬 **Respond to all comments** — Either make changes or explain decisions
- 🔄 **Re-request review** — After addressing feedback
- ✅ **Automatic merge** — Maintainer merges once approved + CI passes

### What "Recording Implementation at the PR" Means

Each PR includes a video showing your feature working. This is **important** because:

1. **Proof of functionality** — Reviewers can see it works without running code
2. **Faster reviews** — No setup needed to understand what changed
3. **Documentation** — Recording becomes part of the PR history

The recording should show:

- Real browser window (not just terminal)
- Your feature being used as a real user would
- Any user interactions (clicks, form fills, etc.)
- Final result clearly visible

---

## Issue Workflow

### How to Pick an Issue

1. **Browse [open issues](https://github.com/Farm-credit/stellar-app-os/issues)**
2. **Look for labels:** `Stellar Wave`, `good-first-issue`, `help-wanted`
3. **Check if it's claimed:** Read comments to see if someone else is working on it
4. **Claim it:** Comment `I'll work on this` or `Assigned to me`

**Do not start work on an issue someone else has claimed without coordinating.**

### How to Signal You're Working on It

Comment on the issue:

```
Hey! I'd like to work on this. I'll implement [brief summary].
```

This prevents duplicate work and shows maintainers you're engaged.

### When to Ask for Help

Don't wait until you're stuck. Ask questions:

1. **In the issue:** Comment with specific questions
2. **On Discord/Slack:** If available in the repo
3. **In PR:** Ask during review if something wasn't clear

Clear indicators you should ask:

- ❓ Unsure about expected behavior
- 🤔 Conflicting requirements
- 🛠️ Need architectural guidance
- 🔌 Integrating a new library

---

## Code Review Guidelines

### What Reviewers Look For

Reviewers evaluate PRs based on these criteria:

#### Code Quality

- ✅ Follows project conventions (naming, import style, patterns)
- ✅ No `any` types or unused variables
- ✅ Uses `forwardRef`, `displayName` where appropriate
- ✅ Proper TypeScript types exported

#### Architecture

- ✅ Atomic design pattern followed (atoms → molecules → organisms)
- ✅ Components are reusable, not feature-specific
- ✅ No circular dependencies
- ✅ Clear separation of concerns

#### Styling

- ✅ Uses Stellar color tokens, not arbitrary colors
- ✅ Responsive design (mobile-first)
- ✅ Tailwind classes organized logically
- ✅ No inline styles

#### Testing

- ✅ Feature works as described in PR
- ✅ No console errors or warnings
- ✅ All builds pass (`pnpm build`, `pnpm lint`)
- ✅ Screen recording shows working implementation

#### Documentation

- ✅ Commits are atomic and descriptive
- ✅ PR description explains what and why
- ✅ Code comments for complex logic
- ✅ No commented-out code left behind

### How to Respond to Feedback

#### Requested Changes (Required)

Must be addressed:

```
Reviewer: "This component doesn't have a displayName"
Author: "Good catch! Adding displayName now." [makes change]
```

#### Suggestions (Optional)

Can address now or in follow-up:

```
Reviewer: "Consider extracting this into a separate component"
Author: "I think it's small enough for now, but noted for future!"
```

#### Questions (Clarify)

Always respond:

```
Reviewer: "Why did you use Context instead of props?"
Author: "Good question. Context needed for deep nesting in
the dashboard and performance advantages. Considered props
drilling but it would go 5 levels deep."
```

#### Process

1. **Read comment carefully** — Understand the concern
2. **Respond to every comment** — Even if you disagree
3. **Make necessary changes** — Push commits
4. **Mark as resolved** — Reply `Done` or `Fixed in abc123`
5. **Re-request review** — Maintainer notified to review again

### Common Reviewer Comments & How to Handle

| Comment                     | What It Means         | How to Respond                                                                                               |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| "This has an `any` type"    | TypeScript not strict | Replace with proper type: `HTMLInputElement`, `ChangeEvent<HTMLInputElement>`, etc.                          |
| "Missing displayName"       | Component debugging   | Add: `Component.displayName = "ComponentName"`                                                               |
| "Use atomic import"         | Fix import style      | Change `import { Button } from "@/components/atoms"` to `import { Button } from "@/components/atoms/Button"` |
| "This should be a molecule" | Architecture concern  | Move component to `molecules/` folder and update imports                                                     |
| "No arbitrary colors"       | Styling consistency   | Replace `bg-blue-500` with `bg-stellar-blue`                                                                 |
| "Screen recording missing"  | PR requirement        | Record yourself using the feature and upload MP4                                                             |

---

## Acceptance Criteria Checklist

Before you open a PR, verify all of these are true:

- [ ] **CONTRIBUTING.md exists** at repo root
- [ ] **Local setup works** — `git clone`, `pnpm install`, `pnpm dev` (no questions needed)
- [ ] **All sections included** — Welcome, Prerequisites, Setup, Architecture, Standards, Commits, PR Process, Issues, Review Guidelines
- [ ] **Examples are copy-paste ready** — Exact commands, file paths, code snippets
- [ ] **Atomic design documented** — Clear folder structure with use cases
- [ ] **Conventional Commits documented** — Allowed types and scopes with examples
- [ ] **Atomic commit rules documented** — Good/bad examples
- [ ] **PR process explained** — Including screen recording requirement
- [ ] **Branch naming documented** — With examples
- [ ] **PR template walkthrough included** — All sections explained
- [ ] **Code review guidelines included** — What reviewers look for, how to respond
- [ ] **No grammatical errors** — Professional tone throughout
- [ ] **All internal links work** — Links to files, sections, GitHub issues

---

## Getting Help

**Stuck?** Here's where to ask:

- 📝 **General questions:** Comment in the relevant issue
- 🐛 **Found a bug:** Open a new issue with reproduction steps
- 💡 **Feature idea:** Discuss in issue before implementing
- 🤝 **Contributing questions:** Ask in issues or pull request comments

---

## License

By contributing to FarmCredit, you agree that your contributions will be licensed under the same license as the project. See [LICENSE](LICENSE) for details.

---

## Thank You! 🙏

Contributing to open-source agriculture software is meaningful work. We appreciate every pull request, issue report, and question. Together, we're building tools for a more equitable agricultural future.

**Happy coding! 🚀**
