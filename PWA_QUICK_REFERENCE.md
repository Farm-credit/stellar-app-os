# PWA Quick Reference

Quick commands and tips for working with the FarmCredit PWA.

## Installation

```bash
# Install dependencies
npm install next-pwa @ducanh2912/next-pwa workbox-window
npm install -D @types/serviceworker sharp

# Generate icons
npm run generate-icons

# Build and start
npm run build
npm start
```

## Development

```bash
# Development mode (service worker won't register)
npm run dev

# Production mode (required for PWA testing)
npm run build && npm start

# Lint
npm run lint
```

## Testing

### Quick Test

```bash
# 1. Build
npm run build

# 2. Start
npm start

# 3. Open http://localhost:3000

# 4. Check DevTools → Application → Service Workers
```

### Offline Test

```bash
# In DevTools:
# Application → Service Workers → Check "Offline"
# Refresh page - should still work
```

### Lighthouse Audit

```bash
# In DevTools:
# Lighthouse → Select "Progressive Web App" → Generate report
# Expected: 100 score
```

## File Locations

```
Key Files:
├── public/sw.js                          # Service worker
├── public/manifest.json                  # Web app manifest
├── lib/pwa.ts                           # PWA utilities
├── components/atoms/InstallPrompt.tsx   # Install prompt
└── app/offline/page.tsx                 # Offline page

Documentation:
├── PWA_SETUP.md                         # Full setup guide
├── INSTALLATION.md                      # Quick start
├── TESTING_CHECKLIST.md                 # Testing guide
└── PWA_IMPLEMENTATION_SUMMARY.md        # Implementation details
```

## Common Tasks

### Update Service Worker

```javascript
// In public/sw.js, increment version:
const CACHE_NAME = 'farmcredit-v2'; // Change v1 → v2
```

### Add Route to Precache

```javascript
// In public/sw.js:
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/your-new-route', // Add here
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];
```

### Customize Install Prompt

```typescript
// Edit components/atoms/InstallPrompt.tsx
// Change text, styling, or dismissal logic
```

### Enable Push Notifications

```bash
# 1. Generate keys
npx web-push generate-vapid-keys

# 2. Add to .env.local
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key

# 3. Use in code
import { requestNotificationPermission } from '@/lib/notifications';
await requestNotificationPermission();
```

## Troubleshooting

### Service Worker Not Registering

```bash
# Check:
1. Using HTTPS or localhost? ✓
2. public/sw.js exists? ✓
3. Console errors? Check DevTools
4. Clear cache: Ctrl+Shift+R
```

### Install Prompt Not Showing

```bash
# Check:
1. Run Lighthouse audit - all PWA criteria met?
2. Already installed? Check chrome://apps
3. Try incognito mode
4. Clear site data and revisit
```

### Offline Not Working

```bash
# Check:
1. Service worker active? DevTools → Application
2. Cache populated? DevTools → Cache Storage
3. Offline mode enabled? DevTools → Network
4. Try hard refresh: Ctrl+Shift+R
```

### Icons Not Loading

```bash
# Fix:
1. Run: npm run generate-icons
2. Check: public/icons/ has PNG files
3. Verify: manifest.json paths correct
4. Clear cache and reload
```

## DevTools Shortcuts

```
Service Worker:
DevTools → Application → Service Workers

Manifest:
DevTools → Application → Manifest

Cache:
DevTools → Application → Cache Storage

Offline Mode:
DevTools → Network → Throttling → Offline

Lighthouse:
DevTools → Lighthouse → Generate report
```

## API Reference

### Service Worker Registration

```typescript
import { registerServiceWorker } from '@/lib/pwa';

// Automatically called in PWAProvider
registerServiceWorker();
```

### Network Status

```typescript
import { subscribeToNetworkStatus } from '@/lib/pwa';

const unsubscribe = subscribeToNetworkStatus((isOnline) => {
  console.log('Network status:', isOnline);
});

// Cleanup
unsubscribe();
```

### Notifications

```typescript
import {
  requestNotificationPermission,
  subscribeToPushNotifications,
  showNotification,
} from '@/lib/notifications';

// Request permission
const permission = await requestNotificationPermission();

// Subscribe
if (permission === 'granted') {
  const subscription = await subscribeToPushNotifications();
}

// Show notification
showNotification('Title', {
  body: 'Message',
  icon: '/icons/icon-192x192.png',
});
```

## Environment Variables

```env
# .env.local (optional - for push notifications)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
```

## Cache Names

```javascript
// Current caches:
'farmcredit-v1'; // Precached assets
'farmcredit-runtime-v1'; // Runtime cached assets
```

## Useful Commands

```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules
rm -rf node_modules && npm install

# Check TypeScript
npm run build

# Check linting
npm run lint

# Generate VAPID keys
npx web-push generate-vapid-keys

# Test production build
npm run build && npm start
```

## Browser Testing URLs

```
Chrome Apps:
chrome://apps

Service Workers:
chrome://serviceworker-internals

Manifest:
chrome://inspect/#service-workers

Clear Storage:
DevTools → Application → Clear storage
```

## Deployment

### Vercel

```bash
# 1. Push to GitHub
git push origin feat/issue-66-pwa

# 2. Import in Vercel
# 3. Add env vars (if using push notifications)
# 4. Deploy
```

### Other Platforms

```
Requirements:
✓ HTTPS enabled
✓ Serve /sw.js with correct headers
✓ Serve /manifest.json with correct MIME type
✓ Don't block service worker registration
```

## Performance Tips

```
1. Precache only essential assets
2. Use cache-first for static assets
3. Use network-first for dynamic content
4. Implement cache expiration
5. Monitor cache size
6. Clean up old caches
```

## Security Checklist

```
✓ HTTPS only (except localhost)
✓ No sensitive data in cache
✓ Proper permission handling
✓ Cache can be cleared by user
✓ No data leaks in console
```

## Support

```
Documentation:
- PWA_SETUP.md - Full guide
- INSTALLATION.md - Quick start
- TESTING_CHECKLIST.md - Testing

Resources:
- https://web.dev/progressive-web-apps/
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps
- https://developers.google.com/web/tools/workbox

Issues:
- Check browser console
- Run Lighthouse audit
- Review documentation
- Open GitHub issue
```

## Cheat Sheet

| Task           | Command                            |
| -------------- | ---------------------------------- |
| Install deps   | `npm install`                      |
| Generate icons | `npm run generate-icons`           |
| Build          | `npm run build`                    |
| Start          | `npm start`                        |
| Lint           | `npm run lint`                     |
| Test offline   | DevTools → Offline                 |
| Audit          | DevTools → Lighthouse              |
| Clear cache    | Ctrl+Shift+R                       |
| Generate VAPID | `npx web-push generate-vapid-keys` |

---

**Quick Start:** `npm install` → `npm run generate-icons` → `npm run build` → `npm start` → Open http://localhost:3000
