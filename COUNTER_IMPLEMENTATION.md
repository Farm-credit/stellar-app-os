# Animated Counter Implementation

## Overview

Implemented animated counters for the homepage that count up when scrolled into view, with proper accessibility support and smooth easing animations.

## Features Implemented

### ✅ Count-up animation triggered on scroll into viewport

- Uses IntersectionObserver API to detect when counter enters viewport
- Animation triggers at 10% visibility threshold
- Only animates once per page load (tracked with `hasAnimated` state)

### ✅ Format large numbers with commas

- Uses `toLocaleString('en-US')` for proper number formatting
- Example: 1234567 displays as "1,234,567"

### ✅ Smooth easing animation

- Implements easeOutQuart easing function for smooth deceleration
- 2-second default duration (configurable via props)
- Uses `requestAnimationFrame` for optimal performance

### ✅ Respects prefers-reduced-motion

- Detects user's motion preference via media query
- Shows final number instantly if reduced motion is preferred
- Dynamically updates if user changes preference

### ✅ Responsive across mobile/tablet/desktop

- Grid layout adapts: 1 column on mobile, 3 columns on larger screens
- Counters are centered and properly spaced
- Uses Tailwind responsive classes

### ✅ Accessible (WCAG 2.1 AA)

- `aria-live="polite"` announces count changes to screen readers
- `aria-atomic="true"` ensures full value is announced
- Respects prefers-reduced-motion for vestibular disorders
- Semantic HTML structure

### ✅ TypeScript strict — no any types

- All types explicitly defined
- Proper interface for component props
- Type-safe state management

## Component API

```typescript
interface CounterProps {
  end: number; // Final number to count to
  duration?: number; // Animation duration in ms (default: 2000)
  className?: string; // Additional CSS classes
  prefix?: string; // Text before number (e.g., "$")
  suffix?: string; // Text after number (e.g., "%")
}
```

## Usage Example

```tsx
import { Counter } from '@/components/atoms/Counter';

<Counter end={1234567} prefix="$" />
<Counter end={5420} />
<Counter end={98} suffix="%" />
```

## Implementation Details

### Files Created

- `components/atoms/Counter.tsx` - Main counter component

### Files Modified

- `app/page.tsx` - Added counter showcase with platform stats

### Key Technical Decisions

1. **Client Component**: Marked with `'use client'` for React hooks usage
2. **IntersectionObserver**: Efficient viewport detection without scroll listeners
3. **requestAnimationFrame**: Smooth 60fps animation
4. **Easing Function**: easeOutQuart provides natural deceleration
5. **Single Animation**: `hasAnimated` flag prevents re-animation on scroll
6. **Accessibility First**: Motion preferences checked before animation

## Testing Checklist

- [ ] Counter animates when scrolling into view
- [ ] Large numbers display with comma formatting
- [ ] Animation has smooth easing (not linear)
- [ ] With prefers-reduced-motion enabled, shows final number instantly
- [ ] Only animates once per page load
- [ ] Responsive on mobile (320px), tablet (768px), desktop (1024px+)
- [ ] Screen reader announces final value
- [ ] No TypeScript errors with strict mode
- [ ] No console errors or warnings

## Browser Compatibility

- IntersectionObserver: All modern browsers
- prefers-reduced-motion: All modern browsers
- requestAnimationFrame: All modern browsers
- toLocaleString: All modern browsers

## Performance Considerations

- Uses IntersectionObserver (more efficient than scroll listeners)
- requestAnimationFrame for optimal rendering
- Cleanup functions prevent memory leaks
- Single animation per counter (no re-renders on scroll)
