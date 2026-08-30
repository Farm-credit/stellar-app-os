# Public API — Rate Limits & Pricing

## Overview

The FarmCredit Public API lets external applications read and submit
carbon-credit, planting, and transaction data. Access is controlled by a
tiered rate-limiting policy so free projects can experiment while high-volume
integrations can scale.

All limits are measured as **requests per calendar day** per API key.

## Rate Limit Tiers

| Tier            | Requests / day | Price       |
| --------------- | -------------- | ----------- |
| **Free**        | 100            | $0 / month  |
| **Paid Tier 1** | 1,000          | $10 / month |
| **Paid Tier 2** | 10,000         | $50 / month |

### Free

- **100 requests/day**
- **$0/month**
- Ideal for evaluation, local development, and low-traffic prototypes.

### Paid Tier 1

- **1,000 requests/day**
- **$10/month**
- Suitable for small production integrations and growing applications.

### Paid Tier 2

- **10,000 requests/day**
- **$50/month**
- Designed for high-volume partners and production workloads.

## Notes

- Rate limits are enforced per API key on a rolling calendar-day window.
- When a tier's daily limit is reached, the API responds with HTTP `429 Too
Many Requests` until the window resets.
- Upgrading to a paid tier increases the daily request allowance immediately
  upon activation.
