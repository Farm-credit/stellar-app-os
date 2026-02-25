# Troubleshooting Guide

## Common Issues and Solutions

---

## 🔧 Installation Issues

### Issue: "pnpm: command not found"

**Problem:** pnpm is not installed globally.

**Solution:**

```bash
npm install -g pnpm
```

**Alternative:** Use npm instead:

```bash
# Instead of: pnpm install
npm install

# Instead of: pnpm dev
npm run dev

# Instead of: pnpm build
npm run build
```

---

### Issue: "Cannot find module 'sharp'"

**Problem:** Sharp package not installed (needed for icon generation).

**Solution:**

```bash
pnpm add -D sharp
# or
npm install --save-dev sharp
```

---

### Issue: "PowerShell execution policy error"

**Problem:** Windows PowerShell blocks script execution.

**Solution:**

```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Alternative:** Use Git Bash or WSL instead of PowerShell.

---

## 📝 TypeScript Issues

### Issue: TypeScript errors in IDE (red squiggles)

**Problem:** Dependencies not installed, React types missing.

**Symptoms:**

- "Cannot find module 'react'"
- "JSX element implicitly has type 'any'"
- Red underlines everywhere

**Solution:**

```bash
# Install dependencies
pnpm install

# Restart your IDE/editor
# VS Code: Ctrl+Shift+P → "Reload Window"
```

**Why this happens:** TypeScript needs the type definitions from `node_modules`. Once installed, errors disappear.

---

### Issue: "Module not found: Can't resolve '@/components/...'"

**Problem:** Path alias not recognized.

**Solution:**

1. Check `tsconfig.json` has:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

2. Restart TypeScript server:
   - VS Code: Ctrl+Shift+P → "TypeScript: Restart TS Server"

---

## 🎨 Counter Issues

### Issue: Counters don't animate

**Possible causes and solutions:**

1. **JavaScript disabled in browser**
   - Enable JavaScript in browser settings

2. **Counter already animated**
   - Counters only animate once per page load
   - Refresh page to see animation again

3. **Not scrolling into view**
   - Make sure to scroll down so counters enter viewport
   - Animation triggers at 10% visibility

4. **Reduced motion enabled**
   - Check browser settings for "prefers-reduced-motion"
   - If enabled, counters show final number instantly (this is correct behavior)

**Debug steps:**

```javascript
// Open browser console (F12)
// Check for errors
console.log('Checking for errors...');

// Verify IntersectionObserver is supported
console.log('IntersectionObserver supported:', 'IntersectionObserver' in window);
```

---

### Issue: Numbers don't show commas

**Problem:** Locale formatting not working.

**Check:**

```javascript
// Test in browser console
console.log((1234567).toLocaleString('en-US'));
// Should output: "1,234,567"
```

**Solution:** This should work in all modern browsers. If not, update your browser.

---

### Issue: Animation is choppy/laggy

**Possible causes:**

1. **Too many animations running**
   - Close other tabs/applications
   - Check CPU usage

2. **Browser performance**
   - Try in different browser
   - Clear browser cache

3. **Hardware acceleration disabled**
   - Enable in browser settings
   - Chrome: Settings → System → "Use hardware acceleration"

---

## 💾 PWA Issues

### Issue: Install prompt doesn't appear

**Possible causes:**

1. **Already installed**
   - Check if app is already installed
   - Uninstall and try again

2. **Not HTTPS**
   - PWA requires HTTPS (or localhost)
   - Use `https://` or test on `localhost`

3. **Manifest issues**
   - Open DevTools → Application → Manifest
   - Check for errors

4. **Service Worker not registered**
   - Open DevTools → Application → Service Workers
   - Check if registered

5. **Browser doesn't support PWA**
   - Try Chrome, Edge, or Safari
   - Firefox has limited PWA support

**Debug steps:**

```javascript
// Check in browser console
console.log('Service Worker supported:', 'serviceWorker' in navigator);
console.log('Manifest:', document.querySelector('link[rel="manifest"]'));
```

---

### Issue: Service Worker not registering

**Symptoms:**

- No service worker in DevTools
- Offline mode doesn't work

**Solutions:**

1. **Check file location**
   - Verify `public/sw.js` exists
   - Should be accessible at `/sw.js`

2. **Clear browser cache**
   - DevTools → Application → Clear storage
   - Click "Clear site data"

3. **Check for errors**
   - Open browser console
   - Look for service worker errors

4. **Verify HTTPS**
   - Service workers require HTTPS (except localhost)

**Manual registration test:**

```javascript
// Run in browser console
navigator.serviceWorker
  .register('/sw.js')
  .then((reg) => console.log('Registered:', reg))
  .catch((err) => console.error('Failed:', err));
```

---

### Issue: Offline mode doesn't work

**Possible causes:**

1. **Service Worker not active**
   - DevTools → Application → Service Workers
   - Should show "activated and is running"

2. **Assets not cached**
   - DevTools → Application → Cache Storage
   - Should see "farmcredit-v1" cache

3. **First visit**
   - Service worker needs one visit to cache assets
   - Visit site online first, then go offline

**Test offline mode:**

1. Visit site while online
2. DevTools → Network tab
3. Check "Offline" checkbox
4. Refresh page
5. Should show offline page or cached content

---

### Issue: Icons not generating

**Problem:** `generate-icons.js` script fails.

**Solutions:**

1. **Sharp not installed**

```bash
pnpm add -D sharp
```

2. **Source icon missing**
   - Check `public/icon-source.svg` exists
   - Or add `public/icon-source.png` (min 512x512px)

3. **Update script for SVG**
   - Script expects PNG by default
   - Modify `scripts/generate-icons.js`:

```javascript
// Change this line:
const sourceIcon = path.join(__dirname, '../public/icon-source.png');
// To this:
const sourceIcon = path.join(__dirname, '../public/icon-source.svg');
```

4. **Run script**

```bash
node scripts/generate-icons.js
```

---

### Issue: Icons don't appear in manifest

**Check:**

1. Icons generated in `public/icons/`
2. Manifest references correct paths
3. Clear browser cache
4. DevTools → Application → Manifest → Check icons

---

## 🏗️ Build Issues

### Issue: Build fails with errors

**Common causes:**

1. **TypeScript errors**

```bash
# Check for errors
pnpm build

# If errors, check specific files
# Fix TypeScript errors before building
```

2. **Missing dependencies**

```bash
# Reinstall dependencies
rm -rf node_modules
pnpm install
```

3. **Corrupted cache**

```bash
# Clear Next.js cache
rm -rf .next
pnpm build
```

4. **Out of memory**

```bash
# Increase Node memory
NODE_OPTIONS=--max_old_space_size=4096 pnpm build
```

---

### Issue: "Module not found" during build

**Solution:**

```bash
# Clear everything and reinstall
rm -rf node_modules .next
pnpm install
pnpm build
```

---

## 🌐 Browser Issues

### Issue: Features work in Chrome but not Safari

**PWA differences:**

- Safari has limited PWA support
- Install prompt works differently
- Some features may not be available

**Solution:** Test in multiple browsers, document limitations.

---

### Issue: Features work in Firefox but not Edge

**Check:**

1. Browser version (update to latest)
2. Browser settings (JavaScript enabled, etc.)
3. Console errors (F12)

---

## 🔍 Debugging Tips

### Enable Verbose Logging

Add to `lib/pwa.ts`:

```typescript
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return;
  }

  console.log('Registering Service Worker...');

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker registered:', registration.scope);
        // ... rest of code
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
}
```

---

### Check Service Worker Status

```javascript
// Run in browser console
navigator.serviceWorker.getRegistration().then((reg) => {
  if (reg) {
    console.log('Service Worker:', reg.active ? 'Active' : 'Not Active');
    console.log('Scope:', reg.scope);
    console.log('State:', reg.active?.state);
  } else {
    console.log('No Service Worker registered');
  }
});
```

---

### Check Cache Contents

```javascript
// Run in browser console
caches.keys().then((keys) => {
  console.log('Cache names:', keys);
  keys.forEach((key) => {
    caches.open(key).then((cache) => {
      cache.keys().then((requests) => {
        console.log(
          `Cache "${key}":`,
          requests.map((r) => r.url)
        );
      });
    });
  });
});
```

---

### Test Counter Animation

```javascript
// Run in browser console
// Force counter to animate again
document.querySelectorAll('[class*="Counter"]').forEach((el) => {
  el.scrollIntoView({ behavior: 'smooth' });
});
```

---

## 🆘 Still Having Issues?

### Checklist

- [ ] Dependencies installed (`node_modules` exists)
- [ ] No TypeScript errors in terminal
- [ ] Build passes (`pnpm build`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Browser console shows no errors
- [ ] Using modern browser (Chrome, Edge, Safari)
- [ ] JavaScript enabled
- [ ] HTTPS or localhost
- [ ] Cleared browser cache

### Get Help

1. **Check browser console** (F12) for errors
2. **Check terminal** for build errors
3. **Try different browser**
4. **Clear all caches** and try again
5. **Restart development server**

### Nuclear Option (Start Fresh)

```bash
# Delete everything
rm -rf node_modules .next pnpm-lock.yaml

# Reinstall
pnpm install

# Rebuild
pnpm build

# Test
pnpm dev
```

---

## 📚 Additional Resources

### Browser DevTools

- **Chrome DevTools:** F12 or Ctrl+Shift+I
- **Application Tab:** Service Workers, Cache, Manifest
- **Console Tab:** JavaScript errors
- **Network Tab:** Test offline mode
- **Lighthouse:** PWA audit

### Testing Tools

- **Lighthouse:** Built into Chrome DevTools
- **PWA Builder:** https://www.pwabuilder.com/
- **Web.dev:** https://web.dev/progressive-web-apps/

### Documentation

- **Next.js:** https://nextjs.org/docs
- **Service Workers:** https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- **Web App Manifest:** https://developer.mozilla.org/en-US/docs/Web/Manifest
- **IntersectionObserver:** https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API

---

## ✅ Prevention Tips

1. **Always install dependencies first**
2. **Clear cache when things break**
3. **Test in multiple browsers**
4. **Check console for errors**
5. **Keep browser updated**
6. **Use HTTPS in production**
7. **Test offline mode regularly**
8. **Monitor service worker status**

---

Most issues are solved by:

1. Installing dependencies
2. Clearing caches
3. Restarting the dev server
4. Checking the browser console

Good luck! 🚀
