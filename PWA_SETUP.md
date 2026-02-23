# PWA Implementation Guide

This document provides comprehensive setup and testing instructions for the FarmCredit PWA implementation.

## Overview

FarmCredit is now a fully functional Progressive Web App (PWA) with:

- ✅ Service worker for offline caching
- ✅ Web app manifest with icons
- ✅ Offline fallback page
- ✅ Install prompt on supported browsers
- ✅ Push notification setup (optional)
- ✅ Network status indicator
- ✅ Responsive design (mobile/tablet/desktop)
- ✅ WCAG 2.1 AA accessibility compliance
- ✅ TypeScript strict mode (no `any` types)

## Installation

### 1. Install Dependencies

```bash
npm install next-pwa @ducanh2912/next-pwa workbox-window
npm install -D @types/serviceworker sharp
```

Or if using pnpm:

```bash
pnpm add next-pwa @ducanh2912/next-pwa workbox-window
pnpm add -D @types/serviceworker sharp
```

### 2. Generate PWA Icons

Place a source icon (minimum 512x512px) at `public/icon-source.png`, then run:

```bash
npm run generate-icons
```

This will generate all required icon sizes (72x72 to 512x512) in `public/icons/`.

### 3. Add Screenshots (Optional but Recommended)

Add the following screenshots for better app store presentation:

- `public/screenshots/desktop-1.png` (1280x720)
- `public/screenshots/mobile-1.png` (750x1334)

### 4. Environment Variables (Optional - for Push Notifications)

Create a `.env.local` file:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key_here
VAPID_PRIVATE_KEY=your_vapid_private_key_here
```

Generate VAPID keys using:

```bash
npx web-push generate-vapid-keys
```

## File Structure

```
stellar-app-os/
├── app/
│   ├── api/
│   │   └── health/
│   │       └── route.ts              # Health check endpoint
│   ├── offline/
│   │   └── page.tsx                  # Offline fallback page
│   └── layout.tsx                    # Updated with PWA metadata
├── components/
│   ├── atoms/
│   │   ├── InstallPrompt.tsx         # Install prompt component
│   │   └── NetworkStatus.tsx         # Network status indicator
│   └── providers/
│       └── PWAProvider.tsx           # PWA initialization provider
├── lib/
│   ├── pwa.ts                        # Service worker utilities
│   └── notifications.ts              # Push notification utilities
├── public/
│   ├── icons/                        # PWA icons (generated)
│   ├── screenshots/                  # App screenshots
│   ├── manifest.json                 # Web app manifest
│   └── sw.js                         # Service worker
├── scripts/
│   └── generate-icons.js             # Icon generation script
└── next.config.ts                    # Updated with PWA headers
```

## Features

### 1. Service Worker Caching

The service worker implements a multi-strategy caching approach:

- **Precache**: Essential assets cached on install (`/`, `/offline`, manifest, icons)
- **Cache First**: Static assets (JS, CSS, images, fonts)
- **Network First**: API calls with cache fallback
- **Offline Fallback**: Custom offline page for navigation requests

### 2. Install Prompt

The app displays a native install prompt on supported browsers:

- Appears automatically when PWA criteria are met
- Can be dismissed (won't show again for 7 days)
- Styled with Stellar brand colors
- Fully accessible with keyboard navigation

### 3. Offline Support

When offline:

- Cached pages continue to work
- API responses served from cache when available
- Custom offline page displays for uncached routes
- Network status indicator shows connection state

### 4. Push Notifications (Optional)

To enable push notifications:

1. Generate VAPID keys and add to `.env.local`
2. Call `requestNotificationPermission()` to request permission
3. Call `subscribeToPushNotifications()` to subscribe
4. Send notifications from your backend using the subscription

Example usage:

```typescript
import { requestNotificationPermission, subscribeToPushNotifications } from '@/lib/notifications';

// Request permission
const permission = await requestNotificationPermission();

if (permission === 'granted') {
  // Subscribe to push notifications
  const subscription = await subscribeToPushNotifications();
  // Send subscription to your backend
}
```

### 5. Network Status

The app automatically detects and displays network status changes:

- Shows "Back Online" badge when connection restored
- Shows "Offline Mode" badge when connection lost
- Auto-hides after 5 seconds
- Accessible with proper ARIA labels

## Testing

### Local Testing

1. Build the production version:

```bash
npm run build
npm start
```

2. Open http://localhost:3000 in your browser

3. Test offline functionality:
   - Open DevTools → Application → Service Workers
   - Check "Offline" checkbox
   - Navigate the app to verify offline support

### Mobile Testing

#### Android (Chrome)

1. Deploy to a server with HTTPS (required for PWA)
2. Open the site in Chrome
3. Tap the install prompt or menu → "Install app"
4. Test offline by enabling airplane mode

#### iOS (Safari)

1. Deploy to a server with HTTPS
2. Open the site in Safari
3. Tap Share → "Add to Home Screen"
4. Test offline by enabling airplane mode

### Lighthouse Audit

Run a Lighthouse audit to verify PWA compliance:

1. Open DevTools → Lighthouse
2. Select "Progressive Web App" category
3. Click "Generate report"
4. Verify all PWA checks pass

Expected results:

- ✅ Installable
- ✅ PWA optimized
- ✅ Works offline
- ✅ Configured for a custom splash screen
- ✅ Sets a theme color
- ✅ Content sized correctly for viewport
- ✅ Has a `<meta name="viewport">` tag
- ✅ Provides a valid apple-touch-icon

## Accessibility

All PWA components follow WCAG 2.1 AA guidelines:

- Semantic HTML elements
- Proper ARIA labels and roles
- Keyboard navigation support
- Sufficient color contrast (tested with Stellar colors)
- Focus indicators
- Screen reader announcements for status changes

### Testing Accessibility

1. Keyboard navigation:
   - Tab through install prompt
   - Press Enter/Space to activate buttons
   - Press Escape to dismiss (if implemented)

2. Screen reader:
   - Test with NVDA (Windows) or VoiceOver (Mac/iOS)
   - Verify all interactive elements are announced
   - Check status updates are announced (aria-live)

3. Color contrast:
   - Use DevTools → Lighthouse → Accessibility
   - Verify all text meets WCAG AA standards (4.5:1 for normal text)

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables (if using push notifications)
4. Deploy

Vercel automatically serves the service worker and manifest with correct headers.

### Other Platforms

Ensure your hosting platform:

- Serves the site over HTTPS
- Serves `/sw.js` with `Cache-Control: public, max-age=0, must-revalidate`
- Serves `/manifest.json` with proper MIME type (`application/manifest+json`)
- Doesn't block service worker registration

## Troubleshooting

### Service Worker Not Registering

1. Check browser console for errors
2. Verify HTTPS is enabled (required for PWA)
3. Check DevTools → Application → Service Workers
4. Clear cache and hard reload (Ctrl+Shift+R)

### Install Prompt Not Showing

1. Verify all PWA criteria are met (run Lighthouse audit)
2. Check if app is already installed
3. Clear site data and revisit
4. Some browsers require user engagement before showing prompt

### Offline Mode Not Working

1. Verify service worker is active (DevTools → Application)
2. Check cache storage (DevTools → Application → Cache Storage)
3. Ensure assets are being cached (check Network tab)
4. Try clearing cache and re-caching

### Icons Not Displaying

1. Verify icons exist in `public/icons/`
2. Check manifest.json paths are correct
3. Clear browser cache
4. Verify icon sizes match manifest specifications

## Performance

The PWA implementation includes several performance optimizations:

- Precaching of critical assets
- Runtime caching of API responses
- Efficient cache invalidation
- Background sync for offline actions
- Lazy loading of non-critical components

Expected Lighthouse scores:

- Performance: 90+
- Accessibility: 100
- Best Practices: 100
- SEO: 100
- PWA: 100

## Browser Support

| Browser          | Install | Offline | Push Notifications |
| ---------------- | ------- | ------- | ------------------ |
| Chrome (Android) | ✅      | ✅      | ✅                 |
| Chrome (Desktop) | ✅      | ✅      | ✅                 |
| Safari (iOS)     | ✅      | ✅      | ❌                 |
| Safari (macOS)   | ✅      | ✅      | ❌                 |
| Edge             | ✅      | ✅      | ✅                 |
| Firefox          | ✅      | ✅      | ✅                 |

## Maintenance

### Updating the Service Worker

When you update the service worker:

1. Increment the cache version in `public/sw.js`:

```javascript
const CACHE_NAME = 'farmcredit-v2'; // Increment version
```

2. The service worker will automatically update on next visit
3. Users will be prompted to reload for the new version

### Adding New Routes to Cache

Update the `PRECACHE_ASSETS` array in `public/sw.js`:

```javascript
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/new-route', // Add new route
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];
```

## Security

- Service workers only work over HTTPS (except localhost)
- Push notifications require user permission
- Cached data is stored locally and can be cleared by user
- No sensitive data should be cached
- Implement proper authentication for API endpoints

## Resources

- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Workbox](https://developers.google.com/web/tools/workbox)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

## Support

For issues or questions:

1. Check this documentation
2. Review browser console for errors
3. Run Lighthouse audit for diagnostics
4. Open an issue on GitHub with details
