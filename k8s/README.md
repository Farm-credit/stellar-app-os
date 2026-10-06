# Harvesta — Kubernetes Deployment Guide

Next.js 16 (standalone) + PostgreSQL + Redis running on Kubernetes with autoscaling on CPU, memory, and custom Prometheus metrics.

---

## Directory layout

```
k8s/
├── namespace.yaml                  # harvesta namespace
├── configmap.yaml                  # Non-secret env vars (NEXT_PUBLIC_* etc.)
├── secrets.yaml                    # Secret template — fill before apply
├── deployment-web.yaml             # Next.js app Deployment (2–10 replicas)
├── deployment-postgres.yaml        # PostgreSQL 16 StatefulSet + 20Gi PVC
├── deployment-redis.yaml           # Redis 7 Deployment + 2Gi PVC
├── services.yaml                   # ClusterIP services for all components
├── ingress.yaml                    # nginx Ingress + cert-manager TLS
├── hpa.yaml                        # HPA — CPU / memory / custom metrics
├── prometheus-adapter.yaml         # Prometheus Adapter rules + ServiceMonitor
├── prometheus-adapter-values.yaml  # Helm values for prometheus-adapter chart
├── pdb-quotas.yaml                 # PodDisruptionBudget + ResourceQuota + LimitRange
└── kustomization.yaml              # Kustomize root — apply with `kubectl apply -k k8s/`
```

---

## Prerequisites

| Tool | Purpose |
|---|---|
| `kubectl` ≥ 1.29 | Cluster interaction |
| `kustomize` ≥ 5 (bundled with `kubectl`) | Manifest composition |
| `helm` ≥ 3 | Installing cert-manager, ingress-nginx, prometheus-adapter |
| nginx Ingress Controller | Routing external traffic |
| cert-manager | Automatic Let's Encrypt TLS |
| metrics-server | CPU / memory metrics for HPA |
| Prometheus + prometheus-adapter | Custom metric HPA (RPS / latency) |

### Install cluster addons once

```bash
# 1. Ingress controller
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace

# 2. cert-manager (CRDs first)
helm upgrade --install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace --set installCRDs=true

# 3. metrics-server (skip if your cloud provider bundles it)
helm upgrade --install metrics-server metrics-server/metrics-server \
  -n kube-system

# 4. kube-prometheus-stack (Prometheus + Grafana)
helm upgrade --install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace

# 5. Prometheus Adapter (for custom metrics HPA)
helm upgrade --install prometheus-adapter \
  prometheus-community/prometheus-adapter \
  -n monitoring \
  -f k8s/prometheus-adapter-values.yaml
```

---

## Step-by-step deployment

### 1 — Build and push the Docker image

```bash
# Build (public env vars are baked in at build time)
docker build \
  --build-arg NEXT_PUBLIC_STELLAR_NETWORK=testnet \
  --build-arg NEXT_PUBLIC_APP_URL=https://harvesta.app \
  -t ghcr.io/harvesta/harvesta-web:$(git rev-parse --short HEAD) .

# Push
docker push ghcr.io/harvesta/harvesta-web:$(git rev-parse --short HEAD)
```

The Dockerfile is a three-stage build: `deps` → `builder` → `runner`.
The final image uses Next.js **standalone** output, runs as UID 1001 (non-root), and weighs ~300 MB.

### 2 — Fill in secrets

Edit `k8s/secrets.yaml` (never commit real values):

```bash
# Base64-encode a value:
echo -n "my-secret-value" | base64

# Or use Sealed Secrets (recommended for GitOps):
kubeseal --format yaml < k8s/secrets-plain.yaml > k8s/secrets.yaml
```

Required secrets:
- `DATABASE_URL` — `postgresql://user:pass@postgres:5432/harvesta`
- `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL`
- `REGION_HASH_SECRET` — `openssl rand -hex 32`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- `AWS_*` — S3 credentials for planter photo uploads
- `ADMIN_SECRET`
- `NEXT_PUBLIC_CONTRACT_*` — deployed Soroban contract IDs
- `postgres-secrets` — `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `redis-secrets` — `REDIS_PASSWORD`

### 3 — Update the image tag in kustomization.yaml

```yaml
# k8s/kustomization.yaml
images:
  - name: ghcr.io/harvesta/harvesta-web
    newTag: <your-sha-or-semver>
```

Or pass it on the command line:

```bash
cd k8s && kustomize edit set image ghcr.io/harvesta/harvesta-web:abc1234
```

### 4 — Apply

```bash
# Dry run first
kubectl apply -k k8s/ --dry-run=client

# Apply
kubectl apply -k k8s/

# Watch rollout
kubectl rollout status deployment/harvesta-web -n harvesta
```

### 5 — Apply Prometheus Adapter (separate namespace)

```bash
# The adapter ConfigMap and ServiceMonitor live in the monitoring namespace
kubectl apply -f k8s/prometheus-adapter.yaml
```

### 6 — Run database migrations

```bash
kubectl exec -n harvesta \
  $(kubectl get pod -n harvesta -l app.kubernetes.io/component=web -o jsonpath='{.items[0].metadata.name}') \
  -- sh -c 'psql $DATABASE_URL -f /app/db/migrations/001_create_indexed_transactions.sql'
```

---

## Autoscaling overview

The HPA (`k8s/hpa.yaml`) watches four metrics and scales `harvesta-web` between **2 and 10 replicas**:

| Metric | Source | Target | Scale signal |
|---|---|---|---|
| CPU utilisation | metrics-server | 60% of 250m request | High SSR / Soroban RPC load |
| Memory utilisation | metrics-server | 75% of 256Mi request | Large response payloads |
| `api_request_rps` | Prometheus Adapter | 50 req/s per pod | Traffic spikes |
| `api_request_duration_p95_ms` | Prometheus Adapter | 500 ms per pod | Latency degradation |

Scale-up is fast (30 s stabilisation, +2 pods or +50% per 30 s).  
Scale-down is conservative (300 s stabilisation, −1 pod per 60 s) to avoid thrashing.

The custom metrics flow:
```
/api/metrics (Prometheus text) → Prometheus → prometheus-adapter
→ custom.metrics.k8s.io API → HPA controller → scales Deployment
```

---

## Verifying the custom metrics pipeline

```bash
# Check prometheus-adapter logs
kubectl logs -n monitoring deploy/prometheus-adapter | tail -20

# List available custom metrics
kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1 | jq .

# Query a specific metric
kubectl get --raw \
  "/apis/custom.metrics.k8s.io/v1beta1/namespaces/harvesta/pods/*/api_request_rps" | jq .

# Check HPA status
kubectl get hpa -n harvesta
kubectl describe hpa harvesta-web -n harvesta
```

---

## Useful operations

```bash
# Check pod status
kubectl get pods -n harvesta

# Stream web logs
kubectl logs -n harvesta -l app.kubernetes.io/component=web -f

# Port-forward for local testing (bypasses Ingress)
kubectl port-forward svc/harvesta-web 3000:80 -n harvesta

# Force a rollout (e.g. to pick up a new secret)
kubectl rollout restart deployment/harvesta-web -n harvesta

# Scale manually (HPA will resume control automatically)
kubectl scale deployment harvesta-web --replicas=4 -n harvesta
```

---

## Storage classes

The manifests reference `storageClassName: standard`. Replace this with your cluster's actual StorageClass:

| Cloud | StorageClass |
|---|---|
| GKE | `standard-rwo` or `premium-rwo` |
| EKS | `gp3` |
| AKS | `managed-premium` |
| Kind / local | `standard` |

```bash
kubectl get storageclass
```

---

## Security notes

- All pods run as UID 1001 (non-root), `allowPrivilegeEscalation: false`, with `ALL` Linux capabilities dropped.
- Secrets are never baked into the image; they are injected via Kubernetes Secret refs at runtime.
- TLS termination at the Ingress; internal traffic is plain HTTP (acceptable for in-cluster communication).
- Rate limiting (100 req/s) is enforced at the Ingress level.
- HSTS is enabled with a 1-year max-age.
