# Pull Request: Mobile Navigation Drawer

## Summary

Implements a fully accessible mobile navigation drawer with wallet integration for mobile users. Includes smooth slide-in animation, keyboard navigation, and WCAG 2.1 AA compliance.

**Closes:** #65

## What Was Implemented

### Components

- **Header.tsx** - Sticky header with desktop nav links, hamburger menu button, theme toggle, language selector, wallet balance display, and WalletModal integration
- **MobileDrawer.tsx** - Slide-out drawer (framer-motion spring animation from right) with navigation links, LanguageSelector, wallet connect/disconnect, focus trap, swipe-to-close gesture, body scroll lock, and Escape key handling
- **LanguageSelector.tsx** - Dropdown with desktop/mobile variants

### Integrated Dependencies

- `useSwipeGesture` hook from `/hooks/useSwipeGesture.ts`
- `useWalletContext` from `/contexts/WalletContext.tsx`
- `WalletModal` from `/components/organisms/WalletModal/`
- `useTheme` from `/hooks/useTheme.ts`

### Key Features

- Framer-motion spring slide-in animation (right side)
- 5 nav links: Home, Projects, Marketplace, Transactions, Dashboard
- Wallet connect/disconnect with truncated public key display
- Focus trap and keyboard navigation (Tab, Shift+Tab, Escape)
- Touch swipe-to-close (80px threshold, 100px vertical tolerance)
- Body scroll lock when drawer is open
- Auto-close on link click, backdrop click, or Escape key
- Stagger-fade nav link animations on open
- Theme toggle (light/dark mode) on both desktop and mobile
- Language selector with desktop dropdown and mobile full-width variant
- Desktop wallet balance display (XLM + USDC)
- Responsive: drawer on `< 768px` (md), horizontal nav on `>= 768px`

### Accessibility (WCAG 2.1 AA)

- ARIA attributes: `role="dialog"`, `aria-modal`, `aria-current="page"`, `aria-label`, `aria-expanded`, `aria-controls`, `aria-hidden`
- Focus management with auto-focus on close button when drawer opens
- Keyboard navigation (Tab/Shift+Tab cycle, Escape to close)
- Body scroll lock prevents background scrolling
- Skip-to-main-content link
- Screen reader friendly with semantic HTML landmarks (`banner`, `navigation`, `dialog`)

### Testing

- **Header.test.tsx** - 29 tests covering rendering, desktop nav, mobile drawer integration, theme toggle, language selector, wallet integration (connect/disconnect/balances), accessibility, scroll shadow
- **MobileDrawer.test.tsx** - 37 tests covering rendering, accessibility (ARIA roles, aria-current, aria-modal, labels), interactions (close button, backdrop, Escape key, wallet button, nav links), body scroll lock, swipe gesture (5 scenarios), active link styling, focus management, responsive visibility

### Files

```
components/organisms/Header/
├── Header.tsx (204 lines)
├── MobileDrawer.tsx (303 lines)
├── LanguageSelector.tsx (113 lines)
├── Header.test.tsx (435 lines)
├── MobileDrawer.test.tsx (508 lines)
├── README.md
```

### Files Modified

- `app/layout.tsx` - Added Header component, WalletProvider wrapper, Inter font import
- `vitest.setup.ts` - Added scrollIntoView mock for jsdom compatibility
