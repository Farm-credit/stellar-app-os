# Deployment Playbook: Dev to Production

This document serves as the authoritative operational deployment playbook for **FarmCredit / Stellar-App-OS**. It provides step-by-step procedures for deploying changes across all environment tiers: Development, Staging, Pre-Production (Staging-v2), Canary, and Full Production.

---

## 1. Environment Architecture & Topology

The platform consists of:
- **Next.js PWA Front-End**: Deployed to Vercel/Netlify with edge middleware caching and service worker lifecycle management.
- **Soroban Smart Contracts**: Deployed to Stellar Testnet/Mainnet with automated TTL renewal bots and state archiving management.
- **Backend & Event Indexer Node**: Node.js/TypeScript microservices running in Docker containers behind NGINX load balancers.
- **Database & Cache**: PostgreSQL with Prisma ORM for relational state, Redis for real-time leaderboards, rate limiting, and currency exchange rate caching.
- **Monitoring & Observability**: Sentry error tracking, ELK stack (Elasticsearch, Logstash, Kibana), and Prometheus/Grafana metrics collection.

### Environment Tiers Overview

| Environment | Purpose | Infrastructure / Network | Trigger |
| :--- | :--- | :--- | :--- |
| **Development** | Local feature development & developer testing | Local Docker Compose + Soroban local container | Local `npm run dev` |
| **Staging** | Continuous Integration & preview validation | Vercel Preview / Testnet contracts | Pull Request merge to `main` or PR branch |
| **Pre-Production** | Production mirror for load & security audits | Dedicated Staging-v2 cluster + Testnet | Tagged release `rc-*` |
| **Canary** | Controlled live traffic validation (5% → 100%) | Production Cluster (traffic shifted via Edge/CDN) | Production Deployment Pipeline |
| **Production** | Live public production service | Production Cluster + Stellar Mainnet | Production Approval & Deployment |

---

## 2. Environment Configuration Matrix

The following environment parameters must be configured for each deployment tier:

```ini
# Core Configuration
NEXT_PUBLIC_APP_ENV=production|canary|preprod|staging|development
NEXT_PUBLIC_APP_URL=https://app.farmcredit.io

# Stellar / Soroban Contract Configuration
STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
STELLAR_RPC_URL="https://soroban-rpc.mainnet.stellar.org"
SOROBAN_TREE_TOKEN_CONTRACT_ID="C..."
SOROBAN_MARKETPLACE_CONTRACT_ID="C..."

# Database & Storage
DATABASE_URL="postgresql://user:password@db.prod.internal:5432/farmcredit"
REDIS_URL="redis://:password@redis.prod.internal:6379"

# Feature Flags & Rollouts
CANARY_TRAFFIC_PERCENTAGE=5
ENABLE_NFT_MARKETPLACE=true
ENABLE_LIVE_CURRENCY_CONVERSION=true

# External Services & Keys
CURRENCY_API_KEY="secret_..."
SENTRY_DSN="https://..."
```

---

## 3. Staging Rollout Procedure

Staging provides a continuous integration environment matching production configurations.

### 3.1 Automated Pipeline
1. Developer opens a Pull Request targeting `main`.
2. GitHub Actions runs CI checks:
   - Linting: `npm run lint`
   - Type Check: `npm run type-check` or `npx tsc --noEmit`
   - Unit & Integration Tests: `npm run test`
3. Automated Preview Deployment is generated (e.g., `https://stellar-app-os-pr-1183.vercel.app`).

### 3.2 Verification on Staging
- Verify API contract stability via `/api/health`.
- Test wallet connectivity against Stellar Futurenet/Testnet.
- Verify PWA service worker caching headers and offline sync capabilities.

---

## 4. Pre-Production Validation (Pre-Prod)

Pre-Production (Staging-v2) mirrors the production infrastructure 1:1, including database size heuristics and security isolation.

### 4.1 Database Migrations
Run schema migration check in dry-run mode before applying to pre-production database:

```bash
# Check pending database migrations
npx prisma migrate status

# Apply migrations on Pre-Production DB
npx prisma migrate deploy
```

### 4.2 Soroban Smart Contract Deployment (Testnet)
Deploy updated Soroban WASM contracts to Testnet and run contract smoke tests:

```bash
# Optimize WASM binaries
cargo build --target wasm32-unknown-unknown --release
stellar contract optimize --wasm target/wasm32-unknown-unknown/release/tree_token.wasm

# Deploy to Testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/tree_token.optimized.wasm \
  --source SPONSOR_KEY \
  --network testnet
```

### 4.3 Load & Security Testing
- **Load Testing**: Execute K6 performance scripts (`scripts/load-test.js`) targeting 5,000 concurrent virtual users. Verify P99 latency remains $< 350\text{ms}$.
- **Security Audit**: Execute automated vulnerability scans (`npm audit`, Snyk, and OWASP ZAP scan).

---

## 5. Canary Deployment Strategy

Canary deployment shifts a small percentage of live user traffic to the new build before full rollout.

```
       [ Client Request ]
               │
      [ Edge CDN / Router ]
         ╱           ╲
  95%   ╱             ╲   5%
       ▼               ▼
┌─────────────┐  ┌─────────────┐
│ Stable V1.0 │  │ Canary V1.1 │
└─────────────┘  └─────────────┘
```

### 5.1 Step-by-Step Traffic Shifting Schedule

1. **Phase 1 (5% Traffic)**: Shift 5% of web requests to Canary build. Monitor for 30 minutes.
2. **Phase 2 (25% Traffic)**: Increase traffic to 25%. Monitor for 1 hour.
3. **Phase 3 (50% Traffic)**: Increase traffic to 50%. Monitor for 2 hours.
4. **Phase 4 (100% Full Cutover)**: Complete deployment to 100% of production traffic.

### 5.2 Automated Rollback Triggers
The canary deployment automatically rolls back to the previous stable release if any of the following metrics are violated:
- HTTP 5xx error rate exceeds $0.5\%$ over a 5-minute window.
- API latency P95 exceeds $800\text{ms}$.
- Soroban RPC transaction submission failure rate exceeds $1.0\%$.
- Uncaught JavaScript exceptions spike by $> 200\%$ on Sentry.

---

## 6. Full Production Rollout Procedure

### 6.1 Pre-Rollout Checklist
- [ ] Pre-production validation passed.
- [ ] Database backup snapshot created (`pg_dump` / AWS RDS Snapshot).
- [ ] Production environment variables verified.
- [ ] On-call engineer and release manager assigned.

### 6.2 Execution Steps
1. **Promote Release**: Tag release in Git (`git tag -a v2.4.0 -m "Release v2.4.0"`).
2. **Deploy Edge Front-End**: Trigger production build on Vercel/Docker Swarm.
3. **Soroban Contract TTL Renewal**: Execute TTL renewal script to ensure mainnet contract instances do not expire:
   ```bash
   npx ts-node scripts/renew-contract-ttl.ts --network mainnet
   ```
4. **Invalidate Cache**: Flush CDN edge cache for updated static assets:
   ```bash
   aws cloudfront create-invalidation --distribution-id DIST_ID --paths "/*"
   ```

---

## 7. Post-Deployment Verification & Emergency Rollback

### 7.1 Health Checks
Verify operational status across endpoints:
- Core Health: `GET /api/health` → `200 OK` `{"status": "healthy"}`
- Monitoring: `GET /api/monitoring` → `200 OK`
- Marketplace API: `GET /api/nft/marketplace` → `200 OK`
- Currency Exchange API: `GET /api/currency/rates` → `200 OK`

### 7.2 Emergency Rollback Playbook
In the event of a critical production failure:

1. **Instant Edge Rollback**: Revert Vercel deployment to the previous instant deployment ID via CLI or Dashboard:
   ```bash
   vercel rollback <previous-deployment-id> --prod
   ```
2. **Database Rollback**: If a database migration caused instability, apply the down migration or restore from pre-deployment RDS snapshot.
3. **Contract Fallback**: If contract logic fails, update `SOROBAN_MARKETPLACE_CONTRACT_ID` to fallback contract address or activate contract pause state.
4. **Incident Post-Mortem**: Document root cause, timeline, affected users, and resolution steps in `docs/post-mortems/`.
