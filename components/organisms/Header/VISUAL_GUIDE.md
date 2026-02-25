# Mobile Drawer Visual Guide

## Component Structure

```
┌─────────────────────────────────────────┐
│  Header (Sticky)                        │
│  ┌──────────┐  FarmCredit  ┌─────────┐ │
│  │ ☰ Menu   │              │ Wallet  │ │
│  └──────────┘              └─────────┘ │
└─────────────────────────────────────────┘
```

## Mobile View (< 768px)

### Closed State
```
┌─────────────────────────────────────────┐
│  ┌──────┐  FarmCredit          ☰        │
│  └──────┘                               │
└─────────────────────────────────────────┘
│                                         │
│         Page Content                    │
│                                         │
```

### Open State
```
┌──────────────┐ ┌─────────────────────────┐
│              │ │  FarmCredit        ✕    │
│  FarmCredit  │ ├─────────────────────────┤
│  ✕           │ │                         │
├──────────────┤ │  🏠 Home                │
│              │ │  📖 Blog                │
│  🏠 Home     │ │  🛒 Purchase Credits    │
│  📖 Blog     │ │  📊 Dashboard           │
│  🛒 Purchase │ │                         │
│  📊 Dashboard│ │                         │
│              │ │                         │
│              │ │                         │
│              │ │                         │
├──────────────┤ │                         │
│ Connect      │ │                         │
│ Wallet       │ │                         │
└──────────────┘ └─────────────────────────┘
  280px wide      Backdrop (blurred)
```

## Desktop View (≥ 768px)

```
┌─────────────────────────────────────────────────────────┐
│  FarmCredit   Home  Blog  Credits  Dashboard   [Wallet] │
└─────────────────────────────────────────────────────────┘
│                                                         │
│                   Page Content                          │
│                                                         │
```

## Animation Flow

### Opening Sequence
```
1. User clicks hamburger (☰)
   ↓
2. Backdrop fades in (0ms → 300ms)
   opacity: 0 → 1
   ↓
3. Drawer slides in (0ms → 300ms)
   transform: translateX(-100%) → translateX(0)
   ↓
4. Focus moves to close button (✕)
```

### Closing Sequence
```
1. User clicks backdrop/link/escape
   ↓
2. Drawer slides out (0ms → 300ms)
   transform: translateX(0) → translateX(-100%)
   ↓
3. Backdrop fades out (0ms → 300ms)
   opacity: 1 → 0
   ↓
4. Focus returns to hamburger button
```

## Interactive States

### Navigation Link States

#### Default
```
┌─────────────────────────┐
│  🏠 Home                │  ← Gray text
└─────────────────────────┘
```

#### Hover
```
┌─────────────────────────┐
│  🏠 Home                │  ← Blue text, gray bg
└─────────────────────────┘
```

#### Active (Current Page)
```
┌─────────────────────────┐
│  🏠 Home                │  ← Blue text, blue bg
└─────────────────────────┘
```

### Wallet Button States

#### Disconnected
```
┌─────────────────────────┐
│   Connect Wallet        │  ← Blue bg, white text
└─────────────────────────┘
```

#### Connected
```
┌─────────────────────────┐
│   GABC...XYZ9           │  ← Outline, blue text
│   Tap to disconnect     │  ← Small gray text
└─────────────────────────┘
```

## Focus Trap Flow

```
Close Button (✕)
      ↓ Tab
   Home Link
      ↓ Tab
   Blog Link
      ↓ Tab
Purchase Credits Link
      ↓ Tab
 Dashboard Link
      ↓ Tab
 Wallet Button
      ↓ Tab
Close Button (✕) ← Loops back
```

## Responsive Breakpoints

```
Mobile:    0px ────────────► 767px
           │                    │
           │  Drawer visible    │
           │  Hamburger shown   │
           └────────────────────┘

Tablet:    768px ──────────► 1023px
           │                    │
           │  Drawer visible    │
           │  Hamburger shown   │
           └────────────────────┘

Desktop:   1024px ─────────► ∞
           │                    │
           │  Horizontal nav    │
           │  No hamburger      │
           └────────────────────┘
```

## Color Scheme

### Light Mode
```
Background:     #FFFFFF (white)
Text:           #0D0B21 (stellar-navy)
Border:         #E2E8F0 (light gray)
Active:         #14B6E7 (stellar-blue)
Hover:          #F1F5F9 (muted)
```

### Dark Mode
```
Background:     #0D0B21 (stellar-navy)
Text:           #F1F5F9 (light gray)
Border:         rgba(255,255,255,0.1)
Active:         #14B6E7 (stellar-blue)
Hover:          #1E1B3A (dark purple)
```

## Accessibility Features

### ARIA Structure
```
<header>
  <nav aria-label="Main navigation">
    <button aria-label="Open navigation menu"
            aria-expanded="false">
      ☰
    </button>
  </nav>
</header>

<div role="dialog"
     aria-modal="true"
     aria-label="Mobile navigation menu">
  
  <button aria-label="Close navigation menu">
    ✕
  </button>
  
  <nav aria-label="Main navigation">
    <a href="/" aria-current="page">Home</a>
    <a href="/blog">Blog</a>
    ...
  </nav>
</div>
```

### Keyboard Shortcuts
```
Tab         → Move focus forward
Shift+Tab   → Move focus backward
Escape      → Close drawer
Enter/Space → Activate focused element
```

## Touch Targets

All interactive elements meet WCAG minimum size:

```
┌────────────────┐
│                │
│   44px × 44px  │  ← Minimum touch target
│                │
└────────────────┘
```

## Z-Index Layers

```
Layer 50: Drawer & Backdrop
Layer 40: Header (sticky)
Layer 0:  Page content
```

## Performance Optimizations

1. **CSS Transforms** - GPU accelerated animations
2. **Backdrop Filter** - Hardware accelerated blur
3. **Will-Change** - Hints for browser optimization
4. **Passive Listeners** - Non-blocking scroll events
5. **Conditional Rendering** - Drawer only renders when needed

## Browser Compatibility

```
✅ Chrome 90+
✅ Firefox 88+
✅ Safari 14+
✅ Edge 90+
✅ iOS Safari 14+
✅ Chrome Mobile 90+
```

## File Organization

```
components/organisms/Header/
├── Header.tsx           ← Main header component
├── MobileDrawer.tsx     ← Drawer component
├── README.md            ← Documentation
└── VISUAL_GUIDE.md      ← This file
```
