# PWA Testing Checklist

Complete checklist for testing the FarmCredit PWA implementation.

## Pre-Testing Setup

- [ ] Dependencies installed (`npm install`)
- [ ] PWA dependencies installed
- [ ] Icons generated (`npm run generate-icons`)
- [ ] Production build successful (`npm run build`)
- [ ] Production server running (`npm start`)

## Service Worker Tests

### Registration

- [ ] Service worker registers on page load
- [ ] Service worker appears in DevTools → Application → Service Workers
- [ ] Service worker status shows "activated and running"
- [ ] No errors in console during registration

### Caching

- [ ] Precached assets appear in Cache Storage
- [ ] Cache named "farmcredit-v1" exists
- [ ] Runtime cache "farmcredit-runtime-v1" created on first navigation
- [ ] Static assets cached on first load
- [ ] API responses cached after first request

### Updates

- [ ] Service worker updates when sw.js changes
- [ ] Update prompt appears when new version available
- [ ] Page reloads correctly after update

## Manifest Tests

### Metadata

- [ ] Manifest loads without errors (DevTools → Application → Manifest)
- [ ] Name: "FarmCredit - Decentralized Agricultural Credit"
- [ ] Short name: "FarmCredit"
- [ ] Description populated correctly
- [ ] Start URL: "/"
- [ ] Display: "standalone"
- [ ] Theme color: "#14B6E7"
- [ ] Background color: "#0D0B21"

### Icons

- [ ] All 8 icon sizes present (72, 96, 128, 144, 152, 192, 384, 512)
- [ ] Icons load without 404 errors
- [ ] Icons display correctly in manifest preview
- [ ] Icons are properly sized and not distorted

### Additional Features

- [ ] Shortcuts defined correctly
- [ ] Categories set appropriately
- [ ] Screenshots configured (if added)

## Offline Functionality Tests

### Basic Offline

- [ ] Enable offline mode in DevTools
- [ ] Homepage loads from cache
- [ ] Navigation works for cached pages
- [ ] Static assets load from cache
- [ ] No network errors for cached resources

### Offline Fallback

- [ ] Navigate to uncached route while offline
- [ ] Offline page displays correctly
- [ ] "Try Again" button works
- [ ] "Go to Home" button works
- [ ] Offline page is styled correctly

### API Caching

- [ ] API calls work online
- [ ] API responses cached after first call
- [ ] Cached API responses served when offline
- [ ] Stale data indicated appropriately (if implemented)

## Install Prompt Tests

### Display

- [ ] Install prompt appears on first visit
- [ ] Prompt displays at bottom of screen
- [ ] Prompt is responsive on mobile viewport
- [ ] Prompt has correct styling (Stellar colors)
- [ ] Icon displays in prompt

### Interaction

- [ ] "Install" button works
- [ ] App installs successfully
- [ ] "Not Now" button dismisses prompt
- [ ] Dismissal stored in localStorage
- [ ] Prompt doesn't reappear for 7 days after dismissal
- [ ] Prompt doesn't appear if already installed

### Installation

- [ ] App installs to home screen/app drawer
- [ ] App icon displays correctly
- [ ] App name displays correctly
- [ ] App opens in standalone mode (no browser UI)
- [ ] App splash screen displays (if supported)

## Network Status Tests

### Online/Offline Detection

- [ ] Status badge appears when going offline
- [ ] Badge shows "Offline Mode"
- [ ] Badge styled with destructive variant (red)
- [ ] Status badge appears when coming back online
- [ ] Badge shows "Back Online"
- [ ] Badge styled with success variant (green)

### Auto-Hide

- [ ] Badge auto-hides after 5 seconds
- [ ] Animation is smooth
- [ ] No console errors during hide

### Accessibility

- [ ] Status announced to screen readers
- [ ] Badge has proper ARIA attributes
- [ ] Color contrast meets WCAG AA

## Responsive Design Tests

### Mobile (< 640px)

- [ ] Install prompt full width
- [ ] Offline page centered and readable
- [ ] Network status badge positioned correctly
- [ ] Touch targets minimum 44x44px
- [ ] No horizontal scrolling

### Tablet (640px - 1024px)

- [ ] Install prompt max-width applied
- [ ] Layout adjusts appropriately
- [ ] All interactive elements accessible

### Desktop (> 1024px)

- [ ] Install prompt positioned bottom-right
- [ ] Max-width constraints applied
- [ ] Layout optimized for large screens

## Accessibility Tests (WCAG 2.1 AA)

### Keyboard Navigation

- [ ] Tab through install prompt
- [ ] Focus indicators visible
- [ ] Enter/Space activates buttons
- [ ] Escape dismisses prompt (if implemented)
- [ ] Tab order logical

### Screen Reader

- [ ] All text announced correctly
- [ ] Button roles announced
- [ ] Status changes announced (aria-live)
- [ ] No unlabeled interactive elements
- [ ] Semantic HTML used throughout

### Color Contrast

- [ ] Text meets 4.5:1 ratio (normal text)
- [ ] Large text meets 3:1 ratio
- [ ] Interactive elements distinguishable
- [ ] Focus indicators visible
- [ ] No color-only information

### Other

- [ ] Images have alt text
- [ ] Form inputs have labels
- [ ] Headings in logical order
- [ ] Language attribute set
- [ ] Viewport meta tag present

## Performance Tests

### Lighthouse Audit

- [ ] Performance score: 90+
- [ ] Accessibility score: 100
- [ ] Best Practices score: 100
- [ ] SEO score: 100
- [ ] PWA score: 100

### PWA Checklist (Lighthouse)

- [ ] Installable
- [ ] PWA optimized
- [ ] Works offline
- [ ] Configured for custom splash screen
- [ ] Sets theme color
- [ ] Content sized correctly for viewport
- [ ] Has viewport meta tag
- [ ] Provides valid apple-touch-icon

### Load Times

- [ ] First load < 3 seconds
- [ ] Cached load < 1 second
- [ ] Offline load instant
- [ ] Time to Interactive < 5 seconds

## TypeScript Tests

### Type Safety

- [ ] No `any` types used
- [ ] All functions have return types
- [ ] All parameters have types
- [ ] Event handlers properly typed
- [ ] No TypeScript errors in build

### Build

- [ ] `npm run build` succeeds
- [ ] No type errors
- [ ] No unused variables
- [ ] Strict mode enabled

## Linting Tests

- [ ] `npm run lint` passes
- [ ] No ESLint errors
- [ ] No ESLint warnings
- [ ] Code follows project conventions

## Browser Compatibility Tests

### Chrome (Desktop)

- [ ] Service worker registers
- [ ] Install prompt appears
- [ ] App installs correctly
- [ ] Offline mode works
- [ ] Push notifications work (if enabled)

### Chrome (Android)

- [ ] Service worker registers
- [ ] Install prompt appears
- [ ] App installs to home screen
- [ ] Standalone mode works
- [ ] Offline mode works
- [ ] Push notifications work (if enabled)

### Safari (iOS)

- [ ] Service worker registers
- [ ] Add to Home Screen works
- [ ] App installs to home screen
- [ ] Standalone mode works
- [ ] Offline mode works
- [ ] Apple touch icon displays

### Safari (macOS)

- [ ] Service worker registers
- [ ] Install works
- [ ] Offline mode works

### Edge

- [ ] Service worker registers
- [ ] Install prompt appears
- [ ] App installs correctly
- [ ] Offline mode works

### Firefox

- [ ] Service worker registers
- [ ] Install works
- [ ] Offline mode works

## Push Notifications Tests (Optional)

### Permission

- [ ] Permission request appears
- [ ] Permission stored correctly
- [ ] Denied permission handled gracefully

### Subscription

- [ ] Subscription created successfully
- [ ] Subscription object valid
- [ ] Subscription persists across sessions

### Notifications

- [ ] Notifications display correctly
- [ ] Icon displays in notification
- [ ] Badge displays in notification
- [ ] Actions work correctly
- [ ] Click opens app

## Security Tests

### HTTPS

- [ ] App served over HTTPS (production)
- [ ] Service worker only registers on HTTPS
- [ ] No mixed content warnings

### Permissions

- [ ] Notification permission requested appropriately
- [ ] Permissions can be revoked
- [ ] App handles denied permissions

### Data

- [ ] No sensitive data in cache
- [ ] Cache can be cleared
- [ ] No data leaks in console

## Edge Cases

### Network

- [ ] Slow 3G connection handled
- [ ] Intermittent connection handled
- [ ] Connection timeout handled
- [ ] Failed requests handled gracefully

### Storage

- [ ] Cache quota exceeded handled
- [ ] Storage cleared by user handled
- [ ] Multiple tabs handled correctly

### Updates

- [ ] Service worker update handled
- [ ] Cache version update handled
- [ ] Manifest update handled

## Documentation Tests

- [ ] PWA_SETUP.md complete and accurate
- [ ] INSTALLATION.md clear and followable
- [ ] README.md updated with PWA info
- [ ] Code comments present where needed
- [ ] Type definitions documented

## Final Checks

- [ ] All tests passing
- [ ] No console errors
- [ ] No console warnings
- [ ] Screen recording created
- [ ] PR description complete
- [ ] Issue linked in PR
- [ ] Ready for review

## Notes

Use this space to document any issues found during testing:

---

## Sign-Off

- [ ] Tested by: **\*\***\_\_\_**\*\***
- [ ] Date: **\*\***\_\_\_**\*\***
- [ ] All critical tests passed
- [ ] All blockers resolved
- [ ] Ready for production
