# Public API — Rate Limits & Pricing

## Overview

The FarmCredit Public API lets external applications read and submit
carbon-credit, planting, and transaction data. Access is controlled by a
per-API-key tiered rate-limiting policy: free projects can experiment,
standard integrations scale, and premium partners run without an hourly cap.

Requests are authenticated with an `x-api-key` header containing a key issued
via `POST /api/api-keys`. All limits are measured as **requests per rolling
hour** per API key.

## Rate Limit Tiers

| Tier       | Requests / hour | Effective policy        |
| ---------- | --------------- | ----------------------- |
| **Free**   | 100             | 100 req/hr, then queued |
| **Standard** | 1,000         | 1,000 req/hr, then queued |
| **Premium**  | unlimited     | no hourly cap           |

### Free

- **100 requests/hour**
- Ideal for evaluation, local development, and low-traffic prototypes.
- When the hourly budget is exhausted, further requests are queued and the API
  responds with `429 Too Many Requests` (plus `Retry-After`) until the window
  rolls.

### Standard

- **1,000 requests/hour**
- Suitable for small production integrations and growing applications.

### Premium

- **Unlimited** — no hourly request cap.
- Designed for high-volume partners and production workloads.

## Request Queuing

When a Free or Standard key exhausts its rolling hourly budget the request is
**queued** rather than dropped. The queue is drained as capacity frees up when
the window rolls, allowing bursts to be processed without losing work.

## Notes

- Rate limits are enforced per API key on a rolling one-hour window.
- When a tier's hourly limit is reached, the API responds with HTTP
  `429 Too Many Requests` until the window resets.
- Invalid or revoked keys receive `401 Unauthorized`.
- Upgrading a key to a higher tier raises (or removes) the hourly allowance
  immediately.
