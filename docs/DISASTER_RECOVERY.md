# Disaster Recovery Plan & Operational Runbook

## Overview & SLA Targets

This document defines the Disaster Recovery (DR) architecture, failover procedures, and operational runbook for the Harvesta / Stellar App OS infrastructure.

### Service Level Objectives (SLOs)
* **Recovery Time Objective (RTO)**: `< 1 hour` (Target Operational RTO: `15 - 30 minutes`).
* **Recovery Point Objective (RPO)**: `< 5 minutes` (Target Operational RPO: `< 1 minute` via Amazon Aurora Global Database streaming physical WAL replication).

---

## Architecture Topology

```
+------------------------------------+           +------------------------------------+
|   PRIMARY REGION (us-east-1)       |           |   SECONDARY REGION (us-west-2)     |
|                                    |           |                                    |
|  +------------------------------+  |  Health   |  +------------------------------+  |
|  | Route53 DNS / ARC Controller |  |  Checks   |  | Route53 Standby Failover     |  |
|  +--------------+---------------+  | --------> |  +--------------+---------------+  |
|                 |                  |           |                 |                  |
|                 v                  |           |                 v                  |
|  +------------------------------+  |           |  +------------------------------+  |
|  | Application Cluster (Primary)|  |           |  | Application Cluster (Standby)|  |
|  +--------------+---------------+  |           |  +--------------+---------------+  |
|                 |                  |           |                 |                  |
|                 v                  | Sync WAL  |                 v                  |
|  +------------------------------+  | Replication| +------------------------------+  |
|  | Aurora Postgres Primary      | ===-==-===>  | Aurora Read Replica (Promote)  |  |
|  +--------------+---------------+  | < 1s lag  +--------------+---------------+  |
|                 |                  |           |                 |                  |
|                 v                  | S3 CRR    |                 v                  |
|  +------------------------------+  | --------> |  +------------------------------+  |
|  | S3 Primary Bucket            |  |           |  | S3 Replicated Bucket          |  |
|  +------------------------------+  |           |  +------------------------------+  |
+------------------------------------+           +------------------------------------+
```

### Components
1. **Database Layer**: Amazon Aurora PostgreSQL Global Database spanning primary (`us-east-1`) and secondary (`us-west-2`) regions. Physical WAL replication delivers continuous sub-second replication latency (RPO < 1 min).
2. **DNS & Traffic Control**: Route53 Routing Control and Application Recovery Controller (ARC) with automated health checks polling primary application load balancers.
3. **Storage Layer**: AWS S3 Buckets configured with Cross-Region Replication (CRR) and KMS Server-Side Encryption for daily backups and media uploads.
4. **Application Compute**: Kubernetes (EKS) / ECS clusters deployed across multi-AZ in both primary and secondary regions, with secondary scaled down during normal operations and dynamically scaled up during failover.

---

## Failover Trigger Criteria

Failover to the secondary region is declared when one or more of the following conditions occur:
1. **Complete Primary AWS Region Outage**: Loss of compute/networking in `us-east-1` for > 10 minutes.
2. **Unrecoverable Primary Database Failure**: Corruption or hardware failure in primary Aurora writer cluster where local failover fails and recovery time exceeds 30 minutes.
3. **Route53 Health Check Failure**: Continuous failure of 3 consecutive health check probes across all primary availability zones.

---

## Step-by-Step Failover Runbook

### Step 1: Verification & Pre-Failover Audit
Execute the DR failover script in dry-run mode to assess system health and replication lag:
```bash
npx tsx scripts/dr-failover.ts --check-only
```
Ensure replication lag between primary and secondary database is `< 300 seconds` (5 minutes) to meet RPO.

### Step 2: Fencing Primary Region (Prevent Split-Brain)
To avoid concurrent writes to two regions:
1. Disable active ingestion in primary gateway.
2. Demote primary writer cluster to read-only mode (if reachable).

### Step 3: Promote Secondary Database Replica
Promote the `us-west-2` secondary Aurora read-replica to primary writer:
```bash
npx tsx scripts/dr-failover.ts --promote-db
```
*Via AWS CLI equivalent:*
```bash
aws rds failover-global-cluster \
  --global-cluster-identifier harvesta-global-db \
  --target-db-cluster-identifier harvesta-aurora-us-west-2
```

### Step 4: Scale Secondary Application Compute
Scale up application deployment replicas in `us-west-2`:
```bash
aws eks update-kubeconfig --region us-west-2 --name harvesta-cluster-us-west-2
kubectl scale deployment/harvesta-app --replicas=10 -n production
```

### Step 5: Route53 Traffic Switchover
Update Route53 Application Recovery Controller routing controls to route 100% of global traffic to secondary region:
```bash
npx tsx scripts/dr-failover.ts --switch-dns
```

### Step 6: Post-Failover Verification
Verify system operation in secondary region:
```bash
npx tsx scripts/dr-failover.ts --verify
```
Checks:
- `GET /health` returns HTTP 200 OK.
- Database write transaction test succeeds.
- Horizon / Soroban RPC connection verified.

---

## RPO & RTO SLA Verification Matrix

| Metrics | Target SLA | Measured Operational Capability |
| :--- | :--- | :--- |
| **RPO (Data Loss Window)** | `< 5 Minutes` | ~500ms (Aurora Global DB Physical WAL) |
| **RTO (Total Downtime)** | `< 1 Hour` | 12 - 18 Minutes Automated Failover |
| **DNS Propagation Time** | `< 60 Seconds` | 30 Seconds Route53 TTL |
| **Db Replica Promotion Time** | `< 10 Minutes` | 3 - 5 Minutes |

---

## Failback Operational Procedure

Once primary region (`us-east-1`) is fully restored:
1. Re-establish Aurora Global Database replication in reverse direction (`us-west-2` -> `us-east-1`).
2. Wait for replication lag to reach `< 1 second`.
3. Schedule low-traffic maintenance window.
4. Issue failover command back to `us-east-1` and update Route53 routing state.
