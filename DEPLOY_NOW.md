# 🚀 Deploy FarmCredit to Production - Quick Guide

## Option 1: Vercel (Recommended - Easiest & Free)

### Step 1: Prepare Your Code

First, let's make sure everything is ready:

```bash
# Check if build works
npm run build

# If build fails, fix errors first
```

### Step 2: Push to GitHub

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit your changes
git commit -m "feat: add mobile navigation drawer and prepare for deployment"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Vercel

1. **Go to [vercel.com](https://vercel.com)**
2. **Sign up/Login** with GitHub
3. **Click "Add New Project"**
4. **Import your GitHub repository**
5. **Configure:**
   - Framework Preset: Next.js (auto-detected)
   - Root Directory: ./
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `.next` (auto-detected)
6. **Click "Deploy"**

That's it! Your site will be live in 2-3 minutes at `your-project.vercel.app`

### Step 4: Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions
4. Wait for DNS propagation (5-60 minutes)

---

## Option 2: Netlify (Alternative)

### Step 1: Build Configuration

Create `netlify.toml`:

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
```

### Step 2: Deploy

1. Go to [netlify.com](https://netlify.com)
2. Sign up/Login with GitHub
3. Click "Add new site" → "Import an existing project"
4. Connect to GitHub and select your repository
5. Configure:
   - Build command: `npm run build`
   - Publish directory: `.next`
6. Click "Deploy site"

---

## Option 3: Quick Test Without Deployment

If you just want to test locally first:

### Fix PowerShell Execution Policy

Run PowerShell as Administrator and execute:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then restart your terminal and run:

```bash
npm run dev
```

Visit `http://localhost:3000` to test locally.

---

## Pre-Deployment Checklist

Before deploying, ensure:

- [ ] Code is committed to Git
- [ ] `npm run build` works without errors
- [ ] All features tested locally
- [ ] Mobile drawer works correctly
- [ ] Wallet integration tested
- [ ] No console errors
- [ ] Icons generated (`npm run generate-icons`)

---

## After Deployment

### 1. Verify Your Site

- [ ] Visit your production URL
- [ ] Test mobile navigation drawer
- [ ] Test wallet connection
- [ ] Test all navigation links
- [ ] Test on mobile device
- [ ] Check PWA install prompt

### 2. Test PWA Features

- [ ] Open DevTools → Application → Service Workers
- [ ] Verify manifest loads
- [ ] Test offline functionality
- [ ] Run Lighthouse audit (should score 100 for PWA)

### 3. Share Your Site

Your site is now live! Share it:
- Production URL: `https://your-project.vercel.app`
- Custom domain (if configured): `https://your-domain.com`

---

## Troubleshooting

### Build Fails

```bash
# Check for errors
npm run build

# Common fixes:
npm install
npm run lint
```

### PowerShell Script Error

Run as Administrator:
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Git Issues

```bash
# If git not initialized
git init

# If remote already exists
git remote remove origin
git remote add origin YOUR_REPO_URL
```

---

## Quick Commands Reference

```bash
# Test build locally
npm run build

# Start production build locally
npm start

# Test development
npm run dev

# Generate PWA icons
npm run generate-icons

# Lint code
npm run lint
```

---

## Need Help?

1. **Vercel Docs**: https://vercel.com/docs
2. **Next.js Deployment**: https://nextjs.org/docs/deployment
3. **GitHub Setup**: https://docs.github.com/en/get-started

---

## Estimated Time

- **Vercel**: 5-10 minutes (including GitHub setup)
- **Netlify**: 10-15 minutes
- **Custom Server**: 30-60 minutes

**Recommended**: Start with Vercel - it's the fastest and has the best Next.js support!

---

🎉 **Ready to deploy? Follow Option 1 above!**
