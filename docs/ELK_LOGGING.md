# Centralized Logging Aggregation with ELK Stack

## Overview

This guide details the deployment, configuration, and operation of the centralized logging infrastructure powered by the ELK (Elasticsearch, Logstash, Kibana) stack.

All application microservices, API proxy layers, worker processes, and background indexing jobs emit structured JSON logs with transaction ID (`txId`) context for end-to-end tracing.

---

## ELK Stack Architecture

```
+-------------------+        +-------------------+        +-------------------+
|  Next.js Web App  |        | Worker Processes  |        | API Proxy Gateway |
+---------+---------+        +---------+---------+        +---------+---------+
          |                            |                            |
          | Winston JSON over TCP/HTTP |                            |
          +--------------------+-------+----------------------------+
                               |
                               v
                     +-------------------+
                     | Logstash (50000)  |  <-- Ingest, parse JSON & redact credentials
                     +---------+---------+
                               |
                               v
                     +-------------------+
                     |  Elasticsearch    |  <-- Index: harvesta-logs-YYYY.MM.dd
                     |     (9200)        |
                     +---------+---------+
                               |
                               v
                     +-------------------+
                     |   Kibana (5601)   |  <-- Dashboards & Log Search
                     +-------------------+
```

---

## Quickstart & Deployment

### 1. Launching the ELK Stack

To start Elasticsearch, Logstash, and Kibana services in containerized mode:
```bash
docker compose -f docker-compose.elk.yml up -d
```

### 2. Service Endpoints
* **Elasticsearch**: `http://localhost:9200`
* **Logstash TCP JSON Input**: `localhost:50000`
* **Logstash Beats Input**: `localhost:5044`
* **Kibana Dashboard UI**: `http://localhost:5601`

---

## Configuration & Environment Setup

Add the following environment variables to your application environment or `.env` file to enable automated log forwarding to Logstash:

```env
# Centralized Logging (ELK Stack)
LOGSTASH_HOST=logstash
LOGSTASH_PORT=50000
ELASTICSEARCH_URL=http://elasticsearch:9200
KIBANA_URL=http://localhost:5601
```

---

## Log Schema & Correlation

Logs are emitted in standard JSON format containing the following fields:

```json
{
  "@timestamp": "2026-08-31T10:57:57.123Z",
  "level": "info",
  "message": "Transaction submitted to Soroban RPC",
  "txId": "e6a4b123-4567-89ab-cdef-0123456789ab",
  "service": "harvesta-app",
  "environment": "production",
  "contractId": "CCARBON...123",
  "durationMs": 420
}
```

### Searching Logs in Kibana by `txId`
To trace a request across all services in Kibana:
1. Navigate to `http://localhost:5601` -> **Discover**.
2. Create Index Pattern: `harvesta-logs-*` (Timestamp field: `@timestamp`).
3. Search Query:
   ```kql
   txId : "e6a4b123-4567-89ab-cdef-0123456789ab"
   ```

---

## Log Retention & Lifecycle

* **Daily Indexing**: Log indices follow the pattern `harvesta-logs-YYYY.MM.dd`.
* **Retention Policy**: Logs are retained in Elasticsearch for 30 days by default.
* **Automated Cleanup**: Index Lifecycle Management (ILM) automatically deletes indices older than 30 days.
