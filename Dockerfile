# ────────────────────────────────────────────────────────────
# Dockerfile — Harvesta Web Application (Next.js)
# Issue #1182: Containerize all services
# ────────────────────────────────────────────────────────────

# ── Stage 1: Dependencies ──────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# Copy only package manifests for better layer caching
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── Stage 2: Build ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copy source code
COPY . .

# Generate PWA icons if the script exists
RUN pnpm run generate-icons 2>/dev/null || true

# Build Next.js
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV

RUN pnpm build

# ── Stage 3: Production ────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache libc6-compat

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output (requires next.config.js output: 'standalone')
# If standalone is not configured, fall back to .next/static
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./ 2>/dev/null || true
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static 2>/dev/null || true
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next 2>/dev/null || true
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules 2>/dev/null || true
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./ 2>/dev/null || true

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "server.js"]
