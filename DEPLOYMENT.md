# PWA Deployment Guide

Complete guide for deploying the FarmCredit PWA to production.

## Pre-Deployment Checklist

- [ ] All dependencies installed
- [ ] Icons generated (`npm run generate-icons`)
- [ ] Screenshots added (optional but recommended)
- [ ] Environment variables configured (if using push notifications)
- [ ] Build successful (`npm run build`)
- [ ] Lint passing (`npm run lint`)
- [ ] All tests passing
- [ ] Lighthouse audit score 100 for PWA
- [ ] Tested on local production build
- [ ] Tested offline functionality
- [ ] Tested on mobile devices

## Platform-Specific Guides

### Vercel (Recommended)

Vercel automatically handles PWA requirements with zero configuration.

#### Steps

1. **Push to GitHub**

   ```bash
   git add .
   git commit -m "feat(pwa): add PWA support"
   git push origin feat/issue-66-pwa
   ```

2. **Import Project**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Select the repository

3. **Configure Environment Variables** (Optional - for push notifications)
   - Go to Project Settings → Environment Variables
   - Add:
     ```
     NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key
     VAPID_PRIVATE_KEY=your_private_key
     ```

4. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete
   - Visit your production URL

5. **Verify PWA**
   - Open production URL
   - Check DevTools → Application → Service Workers
   - Verify manifest loads
   - Test offline functionality
   - Run Lighthouse audit

#### Vercel Configuration

No additional configuration needed. Vercel automatically:

- Serves over HTTPS
- Sets correct headers for service worker
- Serves manifest with correct MIME type
- Handles caching appropriately

### Netlify

#### Steps

1. **Create `netlify.toml`**

   ```toml
   [build]
     command = "npm run build"
     publish = ".next"

   [[headers]]
     for = "/sw.js"
     [headers.values]
       Cache-Control = "public, max-age=0, must-revalidate"
       Service-Worker-Allowed = "/"

   [[headers]]
     for = "/manifest.json"
     [headers.values]
       Cache-Control = "public, max-age=31536000, immutable"
       Content-Type = "application/manifest+json"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

2. **Deploy**
   - Connect GitHub repository
   - Set build command: `npm run build`
   - Set publish directory: `.next`
   - Add environment variables (if needed)
   - Deploy

3. **Verify**
   - Check service worker registration
   - Test offline functionality
   - Run Lighthouse audit

### AWS Amplify

#### Steps

1. **Create `amplify.yml`**

   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - npm install
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: .next
       files:
         - '**/*'
     cache:
       paths:
         - node_modules/**/*
   ```

2. **Configure Headers**
   - Go to App Settings → Rewrites and redirects
   - Add custom headers for `/sw.js` and `/manifest.json`

3. **Deploy**
   - Connect repository
   - Configure build settings
   - Add environment variables
   - Deploy

### Docker

#### Dockerfile

```dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate PWA icons
RUN npm run generate-icons

# Build
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY}
      - VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
    restart: unless-stopped
```

#### Deploy

```bash
# Build
docker build -t farmcredit-pwa .

# Run
docker run -p 3000:3000 farmcredit-pwa

# Or with docker-compose
docker-compose up -d
```

### Custom Server (Node.js)

#### Requirements

- Node.js 20+
- HTTPS certificate (required for PWA)
- Reverse proxy (nginx/Apache) recommended

#### Setup

1. **Build the app**

   ```bash
   npm run build
   ```

2. **Configure nginx** (recommended)

   ```nginx
   server {
       listen 443 ssl http2;
       server_name farmcredit.example.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       # Service worker headers
       location /sw.js {
           proxy_pass http://localhost:3000;
           add_header Cache-Control "public, max-age=0, must-revalidate";
           add_header Service-Worker-Allowed "/";
       }

       # Manifest headers
       location /manifest.json {
           proxy_pass http://localhost:3000;
           add_header Cache-Control "public, max-age=31536000, immutable";
           add_header Content-Type "application/manifest+json";
       }
   }
   ```

3. **Start the app**

   ```bash
   npm start
   ```

4. **Use PM2 for process management** (recommended)
   ```bash
   npm install -g pm2
   pm2 start npm --name "farmcredit" -- start
   pm2 save
   pm2 startup
   ```

## Post-Deployment Verification

### 1. HTTPS Check

```bash
# Verify HTTPS is enabled
curl -I https://your-domain.com
```

### 2. Service Worker Check

```bash
# Check service worker is accessible
curl -I https://your-domain.com/sw.js
```

### 3. Manifest Check

```bash
# Check manifest is accessible
curl -I https://your-domain.com/manifest.json
```

### 4. Icons Check

```bash
# Check icons are accessible
curl -I https://your-domain.com/icons/icon-192x192.png
```

### 5. Lighthouse Audit

1. Open production URL
2. Open DevTools → Lighthouse
3. Select "Progressive Web App"
4. Generate report
5. Verify score is 100

### 6. Mobile Testing

#### Android

1. Open site in Chrome
2. Install prompt should appear
3. Install the app
4. Test offline functionality

#### iOS

1. Open site in Safari
2. Tap Share → Add to Home Screen
3. Install the app
4. Test offline functionality

## Environment Variables

### Required for Push Notifications

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
```

### Generate VAPID Keys

```bash
npx web-push generate-vapid-keys
```

## Monitoring

### Service Worker Status

Monitor service worker registration rate:

```javascript
// Add to analytics
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(() => {
    // Track successful registration
    analytics.track('service_worker_registered');
  });
}
```

### Install Rate

Track PWA install rate:

```javascript
window.addEventListener('beforeinstallprompt', (e) => {
  // Track prompt shown
  analytics.track('install_prompt_shown');
});

window.addEventListener('appinstalled', () => {
  // Track successful install
  analytics.track('pwa_installed');
});
```

### Offline Usage

Track offline usage:

```javascript
window.addEventListener('online', () => {
  analytics.track('back_online');
});

window.addEventListener('offline', () => {
  analytics.track('went_offline');
});
```

## Troubleshooting

### Service Worker Not Registering

**Symptoms:**

- No service worker in DevTools
- Console errors about service worker

**Solutions:**

1. Verify HTTPS is enabled
2. Check `/sw.js` is accessible
3. Check for console errors
4. Verify headers are correct
5. Clear cache and retry

### Install Prompt Not Showing

**Symptoms:**

- No install prompt appears
- Can't install app

**Solutions:**

1. Run Lighthouse audit - check PWA criteria
2. Verify manifest is valid
3. Check all icons are accessible
4. Try in incognito mode
5. Check if already installed

### Offline Not Working

**Symptoms:**

- App doesn't work offline
- Blank page when offline

**Solutions:**

1. Verify service worker is active
2. Check cache storage has data
3. Verify offline page exists
4. Check fetch event handlers
5. Clear cache and re-cache

### Icons Not Displaying

**Symptoms:**

- Missing icons in install prompt
- 404 errors for icons

**Solutions:**

1. Run `npm run generate-icons`
2. Verify icons exist in `public/icons/`
3. Check manifest paths are correct
4. Verify icons are accessible via URL
5. Clear cache and reload

## Performance Optimization

### 1. Enable Compression

```nginx
# nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
```

### 2. Enable HTTP/2

```nginx
# nginx
listen 443 ssl http2;
```

### 3. Set Cache Headers

```nginx
# Static assets
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 4. Enable CDN

Use a CDN for static assets:

- Cloudflare
- AWS CloudFront
- Fastly

## Security

### 1. HTTPS Only

Ensure all traffic is HTTPS:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name farmcredit.example.com;
    return 301 https://$server_name$request_uri;
}
```

### 2. Security Headers

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

### 3. Content Security Policy

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;
```

## Rollback Plan

If issues occur after deployment:

1. **Revert to previous version**

   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Unregister service worker** (if needed)

   ```javascript
   navigator.serviceWorker.getRegistrations().then((registrations) => {
     registrations.forEach((registration) => registration.unregister());
   });
   ```

3. **Clear caches**
   ```javascript
   caches.keys().then((names) => {
     names.forEach((name) => caches.delete(name));
   });
   ```

## Support

For deployment issues:

1. Check deployment logs
2. Verify all requirements met
3. Run Lighthouse audit
4. Check browser console
5. Review this guide
6. Open GitHub issue with details

## Checklist

- [ ] HTTPS enabled
- [ ] Service worker accessible
- [ ] Manifest accessible
- [ ] Icons accessible
- [ ] Environment variables set
- [ ] Build successful
- [ ] Lighthouse PWA score 100
- [ ] Tested on mobile devices
- [ ] Offline functionality works
- [ ] Install prompt appears
- [ ] Monitoring configured
- [ ] Backup plan ready

---

**Deployment Complete!** 🚀

Your PWA is now live and accessible to users worldwide.
