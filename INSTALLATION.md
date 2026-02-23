# PWA Installation Guide

Quick start guide for setting up the FarmCredit PWA.

## Prerequisites

- Node.js 20+
- npm or pnpm
- Git

## Step 1: Install Dependencies

```bash
# Using npm
npm install

# Or using pnpm
pnpm install
```

## Step 2: Install PWA Dependencies

```bash
# Using npm
npm install next-pwa @ducanh2912/next-pwa workbox-window
npm install -D @types/serviceworker sharp

# Or using pnpm
pnpm add next-pwa @ducanh2912/next-pwa workbox-window
pnpm add -D @types/serviceworker sharp
```

## Step 3: Generate PWA Icons

The project includes a placeholder SVG icon. To generate all required PNG icons:

```bash
npm run generate-icons
```

This creates icons in the following sizes:

- 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512

### Custom Icon (Optional)

To use your own icon:

1. Create a PNG file (minimum 512x512px)
2. Save it as `public/icon-source.png`
3. Run `npm run generate-icons`

## Step 4: Add Screenshots (Optional)

For better app store presentation, add screenshots:

1. Take a desktop screenshot (1280x720)
2. Save as `public/screenshots/desktop-1.png`
3. Take a mobile screenshot (750x1334)
4. Save as `public/screenshots/mobile-1.png`

## Step 5: Build and Test

```bash
# Build the production version
npm run build

# Start the production server
npm start
```

Open http://localhost:3000 in your browser.

## Step 6: Verify PWA Installation

### Check Service Worker

1. Open DevTools (F12)
2. Go to Application tab
3. Click "Service Workers" in the sidebar
4. Verify "farmcredit-v1" is active

### Check Manifest

1. In DevTools → Application tab
2. Click "Manifest" in the sidebar
3. Verify all fields are populated
4. Check that all icons load without errors

### Test Offline Mode

1. In DevTools → Application → Service Workers
2. Check the "Offline" checkbox
3. Refresh the page
4. The app should still load from cache
5. Navigate to a new route
6. Should show the offline page if not cached

### Test Install Prompt

1. Open the site in Chrome or Edge
2. The install prompt should appear at the bottom
3. Click "Install" to install the app
4. The app should install and open in standalone mode

## Step 7: Run Lighthouse Audit

1. Open DevTools (F12)
2. Go to Lighthouse tab
3. Select all categories
4. Click "Generate report"
5. Verify PWA score is 100

Expected scores:

- Performance: 90+
- Accessibility: 100
- Best Practices: 100
- SEO: 100
- PWA: 100

## Step 8: Test on Mobile (Optional)

### Android

1. Deploy to an HTTPS server (required for PWA)
2. Open the site in Chrome on Android
3. Tap the install prompt or Menu → "Install app"
4. The app should install to your home screen
5. Open the installed app
6. Enable airplane mode and verify offline functionality

### iOS

1. Deploy to an HTTPS server
2. Open the site in Safari on iOS
3. Tap Share → "Add to Home Screen"
4. The app should install to your home screen
5. Open the installed app
6. Enable airplane mode and verify offline functionality

## Optional: Push Notifications

To enable push notifications:

### 1. Generate VAPID Keys

```bash
npx web-push generate-vapid-keys
```

### 2. Add to Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
```

### 3. Test Notifications

```typescript
import { requestNotificationPermission, subscribeToPushNotifications } from '@/lib/notifications';

// Request permission
const permission = await requestNotificationPermission();

if (permission === 'granted') {
  // Subscribe to push notifications
  const subscription = await subscribeToPushNotifications();
  console.log('Subscription:', subscription);
}
```

## Troubleshooting

### Service Worker Not Registering

- Ensure you're using HTTPS (or localhost)
- Check browser console for errors
- Clear cache and hard reload (Ctrl+Shift+R)
- Verify `public/sw.js` exists

### Install Prompt Not Showing

- Run Lighthouse audit to check PWA criteria
- Clear site data and revisit
- Check if app is already installed
- Try in incognito mode

### Icons Not Loading

- Verify icons exist in `public/icons/`
- Check manifest.json paths
- Clear browser cache
- Run `npm run generate-icons` again

### Build Errors

- Delete `.next` folder and rebuild
- Delete `node_modules` and reinstall
- Check for TypeScript errors: `npm run build`
- Check for linting errors: `npm run lint`

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables (if using push notifications)
4. Deploy

Vercel automatically handles PWA requirements.

### Other Platforms

Ensure your hosting platform:

- Serves over HTTPS
- Serves `/sw.js` with correct headers
- Serves `/manifest.json` with correct MIME type
- Doesn't block service worker registration

## Next Steps

- Customize the offline page design
- Add more routes to precache
- Implement background sync
- Add analytics for PWA metrics
- Customize install prompt timing
- Add more notification features

## Resources

- [PWA Setup Documentation](./PWA_SETUP.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [PWA Best Practices](https://web.dev/progressive-web-apps/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

## Support

For issues or questions:

1. Check the [PWA Setup Guide](./PWA_SETUP.md)
2. Review browser console for errors
3. Run Lighthouse audit for diagnostics
4. Open an issue on GitHub
