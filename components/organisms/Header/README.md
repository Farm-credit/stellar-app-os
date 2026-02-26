# Mobile Navigation Drawer - Issue #47

## Overview
A fully accessible mobile navigation drawer with wallet integration for the FarmCredit application.

## Components

### Header.tsx
Main header component with:
- Sticky positioning with backdrop blur
- Desktop navigation (hidden on mobile)
- Desktop wallet connect button
- Mobile hamburger menu trigger
- Responsive breakpoints at `md` (768px)

### MobileDrawer.tsx
Slide-out navigation drawer with:
- Smooth slide-in animation from left (300ms duration)
- Semi-transparent backdrop with blur effect
- Navigation links with active state indicators
- Wallet connect/disconnect button
- Icon-based navigation for better UX

## Features

### Animations
- Slide-in from left using CSS transforms
- Backdrop fade-in/out
- Smooth transitions (300ms ease-in-out)

### Accessibility (WCAG 2.1 AA Compliant)
- Focus trap when drawer is open
- Keyboard navigation (Tab, Shift+Tab, Escape)
- ARIA attributes (`role="dialog"`, `aria-modal`, `aria-label`)
- Focus management (auto-focus close button on open)
- Screen reader friendly labels
- Active page indication with `aria-current="page"`

### User Experience
- Backdrop click to close
- Link click auto-closes drawer
- Body scroll prevention when open
- Visual active state for current page
- Wallet status display
- Touch-friendly tap targets (44px minimum)

### Responsive Design
- Mobile: Full drawer functionality
- Tablet: Drawer available up to 768px
- Desktop: Traditional horizontal navigation

## Navigation Links

1. Home (/)
2. Blog (/blog)
3. Purchase Credits (/credits/purchase)
4. Dashboard (/dashboard/credits)

## Wallet Integration

The drawer integrates with the WalletContext to:
- Display connection status
- Show truncated public key when connected
- Connect via Freighter wallet
- Disconnect and clear session
- Auto-close drawer after wallet action

## TypeScript

All components are strictly typed with:
- No `any` types
- Proper interface definitions
- Type-safe props
- React.ComponentType for icon props

## Usage

The Header component is automatically included in the root layout:

```tsx
import { Header } from "@/components/organisms/Header/Header";

export default function RootLayout({ children }) {
  return (
    <WalletProviderWrapper>
      <Header />
      {children}
    </WalletProviderWrapper>
  );
}
```

## Testing Checklist

- [ ] Drawer opens on hamburger click
- [ ] Drawer closes on backdrop click
- [ ] Drawer closes on link click
- [ ] Drawer closes on Escape key
- [ ] Focus trapped within drawer
- [ ] Tab navigation works correctly
- [ ] Active page highlighted
- [ ] Wallet connect/disconnect works
- [ ] Body scroll prevented when open
- [ ] Smooth animations
- [ ] Responsive across devices
- [ ] Screen reader accessible
- [ ] Touch targets adequate size

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Dependencies

- next/link - Client-side navigation
- next/navigation - usePathname hook
- lucide-react - Icon components
- Tailwind CSS - Styling
- WalletContext - Wallet state management
