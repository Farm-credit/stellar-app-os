![CI](https://github.com/Farm-credit//stellar-app-os/actions/workflows/ci.yml/badge.svg)

![Deploy](https://github.com/Farm-credit/stellar-app-os/actions/workflows/deploy.yml/badge.svg)

# FarmCredit

Decentralized agricultural credit platform built on the [Stellar network](https://stellar.org).

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Design System:** Stellar brand colors + atomic design pattern
- **Package Manager:** pnpm

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Git

### Setup

```bash
git clone git@github.com:Farm-credit/stellar-app-os.git
cd stellar-app-os
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build (also runs type-check) |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |

## Project Architecture

This project follows the **atomic design pattern**. Components are organized by complexity, not by feature.

```
stellar-app-os/
├── app/                    # Next.js App Router pages & layouts
│   ├── globals.css         # Stellar color tokens + Tailwind config
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Landing page
├── components/
│   ├── atoms/              # Smallest building blocks (Button, Input, Text, Badge)
│   ├── molecules/          # Combinations of atoms (Card)
│   ├── organisms/          # Complex sections (headers, forms — to be built)
│   ├── templates/          # Page-level layouts (to be built)
│   └── ui/                 # shadcn/ui base components (do not edit directly unless extending)
├── lib/
│   └── utils.ts            # Shared utilities (cn() helper)
└── public/                 # Static assets
```

### Design Hierarchy

| Level | Purpose | Example |
|-------|---------|---------|
| **Atoms** | Single-purpose UI elements | `Button`, `Input`, `Text`, `Badge` |
| **Molecules** | Groups of atoms working together | `Card`, `FormField` |
| **Organisms** | Complex UI sections | `Header`, `DonationForm`, `ProjectGrid` |
| **Templates** | Page-level structural layouts | `DashboardLayout`, `AuthLayout` |

### Stellar Color Tokens

These brand colors are defined in `app/globals.css` and available as Tailwind classes:

| Token | Value | Tailwind Class |
|-------|-------|----------------|
| Stellar Blue | `#14B6E7` | `bg-stellar-blue`, `text-stellar-blue` |
| Stellar Purple | `#3E1BDB` | `bg-stellar-purple`, `text-stellar-purple` |
| Stellar Navy | `#0D0B21` | `bg-stellar-navy`, `text-stellar-navy` |
| Stellar Cyan | `#00C2FF` | `bg-stellar-cyan`, `text-stellar-cyan` |
| Stellar Green | `#00B36B` | `bg-stellar-green`, `text-stellar-green` |

### Import Convention

**No barrel exports.** Always import directly from the component file:

```tsx
// Correct
import { Button } from "@/components/atoms/Button";
import { Card, CardHeader } from "@/components/molecules/Card";

// Wrong — do not use index.ts barrel exports
import { Button } from "@/components/atoms";
```

---

## Contributing

### 1. Pick an Issue

Browse [open issues](https://github.com/Farm-credit/stellar-app-os/issues) labeled `Stellar Wave`. Comment on the issue to claim it. Do not work on an issue someone else has claimed without coordinating.

### 2. Branch from `main`

Always start from the latest `main`:

```bash
git checkout main
git pull origin main
git checkout -b feat/<issue-number>-<short-description>
```

Branch naming examples:
- `feat/42-wallet-connect-modal`
- `fix/78-rate-limit-toast`
- `docs/107-contributing-guide`

### 3. Coding Standards

- **TypeScript strict mode** — no `any`, no unused variables
- **Component patterns** — use `forwardRef` where needed, always set `displayName`, export named types
- **Naming** — PascalCase for components, camelCase for functions/variables, kebab-case for CSS classes
- **Atomic design** — atoms extend `ui/` base components with Stellar variants; molecules compose atoms
- **No barrel exports** — import directly from the file, not from `index.ts`

### 4. Commit Conventions

This project enforces **Conventional Commits** and **atomic commits**.

#### Commit Message Format

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

#### Allowed Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or component |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no logic change |
| `refactor` | Code restructuring, no behavior change |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or dependency changes |
| `ci` | CI configuration changes |
| `chore` | Maintenance tasks |

#### Allowed Scopes

`auth`, `wallet`, `dashboard`, `marketplace`, `admin`, `donation`, `carbon`, `ui`, `layout`, `nav`, `config`, `deps`

#### Examples

```bash
feat(wallet): add Stellar wallet connection modal
fix(donation): correct minimum amount validation
docs(contributing): add commit convention section
style(ui): format Button component with Prettier
refactor(dashboard): extract tab components into separate files
```

#### Atomic Commit Rules

1. **One concern per commit** — never mix a bug fix with a new feature
2. **Each commit must build** — `pnpm build` must pass at every single commit
3. **Each commit must be revertable** — reverting one commit must not break unrelated code
4. **Order matters** — foundation first, then features, then polish

**Bad example** (one giant commit):
```
feat: add dashboard with tabs, fix header bug, update colors
```

**Good example** (atomic):
```
feat(dashboard): create dashboard page layout
feat(dashboard): add overview tab component
feat(dashboard): add donations tab component
fix(nav): correct active link highlighting on dashboard
style(dashboard): align tab content padding
```

### 5. Pull Request Process

#### Before Submitting

```bash
# Make sure you're up to date with main
git checkout main
git pull origin main
git checkout <your-branch>
git rebase main

# Verify everything passes
pnpm build
pnpm lint
```

#### PR Requirements

Every PR **must** include:

- **Linked issue** — use `Closes #<issue-number>` in the PR description
- **Screen recording** — record your implementation working in the browser and attach it to the PR
- **Filled PR template** — Summary, What Was Implemented, Implementation Details, How to Test
- **Passing CI** — build and lint must pass

> **PRs without a screen recording or without a linked issue will not be reviewed.**

#### PR Template

When you open a PR, the template will auto-populate. Fill out every section:

```markdown
## Summary
<!-- 1-3 sentences: What does this PR do and why? -->

## Related Issue
Closes #<issue-number>

## What Was Implemented
<!-- Detailed list of what was built/changed -->
- [ ] Component X created
- [ ] Styling applied with Stellar tokens
- [ ] Responsive on mobile

## Implementation Details
<!-- Key decisions, patterns used, trade-offs -->

## Screenshots / Recordings
<!-- REQUIRED: Screen recording of your implementation -->

## How to Test
<!-- Step-by-step for reviewers -->
1. Checkout this branch
2. Run `pnpm dev`
3. Navigate to /path
4. Verify X works
```

### 6. Code Review

- Expect feedback. Reviews are about improving the code, not criticizing the author.
- Respond to every comment — either make the change or explain why not.
- After addressing feedback, re-request review.
- Maintainers will merge once approved and CI passes.

### 7. Stay in Sync

While your PR is in review, keep your branch up to date:

```bash
git checkout main
git pull origin main
git checkout <your-branch>
git rebase main
git push --force-with-lease
```

---

## License

This project is open source. See [LICENSE](LICENSE) for details.
