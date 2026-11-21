# Mobile Navigation Drawer

## Overview

A fully accessible mobile navigation drawer with wallet integration for the FarmCredit application.

## Components

### Header.tsx

Main header component with:

- Sticky positioning with backdrop blur and scroll shadow
- Desktop navigation with active link indicator (underline)
- Desktop wallet connect/disconnect with XLM + USDC balance display
- Language selector (desktop variant)
- Theme toggle (light/dark mode)
- Mobile hamburger menu trigger with `aria-expanded` and `aria-controls`
- Responsive breakpoints at `md` (768px)

### MobileDrawer.tsx

Slide-out navigation drawer with:

- Framer-motion spring slide-in animation from right (stiffness=320, damping=32)
- Backdrop fade with blur effect
- Stagger-fade nav link animations (60ms stagger, 100ms delay)
- Navigation links with icon, label, and active state indicator dot
- Wallet connect/disconnect button with truncated public key
- Language selector (mobile variant)
- Touch swipe-to-close gesture (80px threshold)
- Focus trap (Tab/Shift+Tab cycle)
- Escape key handler
- Body scroll lock

### LanguageSelector.tsx

Language dropdown supporting desktop and mobile variants, used inside both Header and MobileDrawer.

## Features

### Animations

- Slide-in from right using framer-motion spring physics
- Backdrop fade-in/out (250ms/200ms)
- Nav items stagger-fade with 60ms delay between each
- Smooth transitions throughout

### Accessibility (WCAG 2.1 AA Compliant)

- Focus trap when drawer is open
- Keyboard navigation (Tab, Shift+Tab, Escape)
- ARIA attributes (`role="dialog"`, `aria-modal`, `aria-label`, `aria-current`, `aria-expanded`, `aria-controls`, `aria-hidden`)
- Focus management (auto-focus close button on open)
- Screen reader friendly labels
- Active page indication with `aria-current="page"`

### User Experience

- Backdrop click to close
- Link click auto-closes drawer
- Body scroll prevention when open
- Visual active state for current page with indicator dot
- Wallet status display with connection/disconnection
- Touch-friendly tap targets (44px minimum)
- Stagger animation for polished feel

### Responsive Design

- Mobile: Full drawer functionality (below 768px)
- Desktop: Traditional horizontal navigation (above 768px)
- Theme toggle visible on both mobile and desktop

## Navigation Links

1. Home (/)
2. Projects (/projects)
3. Marketplace (/marketplace)
4. Transactions (/transactions)
5. Dashboard (/dashboard)

## Wallet Integration

The drawer integrates with the WalletContext to:

- Display connection status
- Show truncated public key when connected
- Connect via Freighter wallet (via WalletModal)
- Disconnect and clear session
- Show XLM and USDC balances on desktop
- Auto-close drawer when opening wallet modal

## TypeScript

All components are strictly typed with:

- No `any` types
- Proper interface definitions
- Type-safe props
- Full test coverage

## Usage

The Header component is included in the root layout:

```tsx
import { Header } from '@/components/organisms/Header/Header';

export default function RootLayout({ children }) {
  return (
    <WalletProvider>
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
    </WalletProvider>
  );
}
```

## Dependencies

- next/link, next/navigation (usePathname)
- framer-motion (AnimatePresence, motion)
- lucide-react (Menu, X, Home, FolderOpen, ShoppingBag, LayoutDashboard, History, Sun, Moon, Globe, ChevronDown, Check)
- Tailwind CSS v4 (CSS-first configuration)
- @/components/atoms/Button, Text
- @/contexts/WalletContext
- @/hooks/useSwipeGesture, useTheme, useTranslation
- @/components/organisms/WalletModal
