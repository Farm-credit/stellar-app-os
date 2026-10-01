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

## Farmer Verification API (v1)

The v1 endpoints below are the stable third-party integration contract for
partner platforms and financial institutions. Requests use the same active
`x-api-key` authentication and tiered limits described above. The report
answers three questions in one call — identity, land ownership, and credit
availability — while returning no personal data or evidence documents.

### `GET /api/v1/farmers/{address}/verification`

Verify one farmer. `address` is a 56-character Stellar public key.

### `POST /api/v1/farmers/verification`

Verify a portfolio of 1–100 unique farmers with
`{"addresses": ["G...", "G..."]}`. The response includes `requested`,
`count`, `verified`, `reports`, `notFound`, and `consentDenied` fields.

Both endpoints return `X-API-Version: v1`, private no-store responses, and the
same `FarmerVerificationReport` fields documented below. A farmer must have
granted recorded consent; otherwise the single-farmer endpoint returns
`403 consent_denied` and the batch endpoint places the address in
`consentDenied`.

## Carbon Price API (v1)

Real-time carbon credit market data for dashboards and integrations (issue
#1326). The v1 response shape is a frozen contract: fields may be added, but
existing ones will not be removed or renamed. Data is public and read-only, so
responses are cacheable and do not require an `x-api-key`.

### `GET /api/v1/carbon-prices`

One quote per listed credit series, with pre-rolled aggregates by credit type,
region and certification standard. All query params are optional and accept
comma-separated, case-tolerant values:

| Parameter    | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `types`      | Project/credit type, e.g. `Reforestation`, `Mangrove Restoration` |
| `regions`    | `africa`, `latin-america`, `southeast-asia`, `oceania`, `north-america`, `global` |
| `standards`  | Certification standard, e.g. `Verra (VCS)`, `Gold Standard`   |
| `projectIds` | Exact project IDs, e.g. `PROJ-004`                            |
| `assetCodes` | Ledger asset codes, e.g. `CARBON-PROJ-004-2024`               |
| `limit`      | 1–500 quotes (default: all)                                   |

```bash
curl "https://<host>/api/v1/carbon-prices?regions=africa&standards=Gold%20Standard"
```

Each quote carries `pricePerTon`, `previousClose`, `change24hAmount`,
`change24hPercent`, `volume24h` and `updatedAt` (USD per tonne), plus the
series' `assetCode`, `projectId`, `projectType`, `region` and `standard`. The
envelope includes `filters`, `count`, `generatedAt`, `source` and an
`aggregates` object (`averagePricePerTon`, `totalVolume24h`, `byType`,
`byRegion`, `byStandard`).

`POST /api/v1/carbon-prices` accepts the same fields as a JSON body
(`{ "types": [...], "regions": [...], ... }`) and returns the identical
snapshot — useful for clients that build complex filter sets.

### `GET /api/v1/carbon-prices/history`

Historical pricing for one listed series, bucketed by `interval`.

| Parameter  | Required | Description                                        |
| ---------- | -------- | -------------------------------------------------- |
| `assetCode`| Yes      | Series to read, e.g. `CARBON-PROJ-004-2024`        |
| `interval` | No       | `day` (default), `week`, or `month`                |
| `from`     | No       | `YYYY-MM-DD`; defaults to 90 days before `to`      |
| `to`       | No       | `YYYY-MM-DD`; defaults to today (UTC)              |

The response contains the `points` array (`at`, `pricePerTon`, `volume`) and a
`stats` rollup (first/last/min/max/average price, `changePercent`,
`totalVolume`).

| Status | Meaning                                                    |
| ------ | ---------------------------------------------------------- |
| `200`  | Snapshot or history                                        |
| `400`  | Validation failure — `{ error, details: string[] }`        |
| `404`  | `assetCode` is not a listed series (history only)          |
| `502`  | Upstream price source unreachable — `{ error, failures }`  |
| `500`  | Unexpected processing failure                              |

All responses carry `X-API-Version: v1`. Snapshot responses are publicly
cacheable for 30 seconds and history for 5 minutes (with stale revalidation),
so polling is safe at dashboard rates.

## Carbon Impact Calculator API (v1)

Company footprint calculator (issue #1333): submit emissions data —
employees, energy use, vehicle fuel — and receive the annual CO2e footprint
plus the number of carbon credits required for a full offset and
recommendations. Stateless and read-only; responses are `private, no-store`
because they contain company data.

### `POST /api/v1/carbon-impact`

```bash
curl -X POST https://<host>/api/v1/carbon-impact \
  -H "Content-Type: application/json" \
  -d '{
    "employees": 10,
    "energy":   { "electricityKwh": 10000, "naturalGasTherms": 100, "renewablePercentage": 25 },
    "vehicles": { "gasolineLiters": 1000, "dieselLiters": 500, "electricKwh": 200 }
  }'
```

`employees` is required and positive; every `energy`/`vehicles` field is
optional and defaults to `0` (`renewablePercentage` must be 0–100). The
response contains:

- `emissions` — `energyKg`, `vehicleKg`, `totalKg`, `totalTonnes`, and
  per-employee intensity (`perEmployeeKg`, `perEmployeeTonnes`).
- `recommendations` — `creditsNeeded` (integer, 1 credit = 1 tCO2e, rounded up
  to fully cover `totalTonnes`), `creditsUnit`, the avoided emissions already
  gained from the renewable share (`renewableEnergySavingsKg`) and free-form
  `notes` for the buyer.
- `factors` — the published kg-CO2e-per-unit emission factors used, so callers
  can audit the arithmetic.

The v1 response shape is a frozen contract: fields may be added, existing
ones will not be removed or renamed. Validation failures return `400` with
`{ error, details: [{ path, message }] }`; malformed JSON returns `400`.

## Farmer Verification API (v2)

For partner platforms, lenders, and financial institutions that need to verify
a farmer before extending credit or purchasing from them. The report answers
three questions in one call — identity, land ownership, and credit
availability — and returns **no personal data**: names, phone numbers, dates of
birth, villages, and identifier digests are never included. A caller learns
*that* a check passed and *when*, never the evidence behind it.

Disclosure also requires the farmer's recorded consent. Without it the record
is reported as `consent_denied` rather than returned partially redacted.

### `GET /api/v2/farmers/{address}/verification`

Verify a single farmer. `address` is a 56-character Stellar public key.

```bash
curl https://<host>/api/v2/farmers/G.../verification \
  -H "x-api-key: fc_..."
```

| Status | Meaning                                                        |
| ------ | -------------------------------------------------------------- |
| `200`  | `FarmerVerificationReport`                                     |
| `400`  | `farmerAddress` is not a valid Stellar public key              |
| `401`  | Missing, invalid, revoked, or inactive API key                 |
| `403`  | `consent_denied` — the farmer has not consented to disclosure  |
| `404`  | `not_found` — no verification record for this farmer           |
| `503`  | Authentication is temporarily unavailable                      |

```json
{
  "farmerAddress": "G...",
  "apiVersion": "v2",
  "verificationStatus": "verified",
  "verified": true,
  "identity": {
    "verified": true,
    "verifiedAt": "2026-07-01T10:00:00.000Z",
    "documentType": "nin"
  },
  "land": {
    "verified": true,
    "verifiedAt": "2026-07-02T10:00:00.000Z",
    "ownershipType": "customary",
    "plotSizeHectares": 2.5,
    "region": "Kano",
    "gpsCoordinates": { "latitude": 11.98, "longitude": 8.55 }
  },
  "certification": {
    "eligible": true,
    "tier": "provisional",
    "blockers": [],
    "advisories": ["agricultural_training_record"],
    "rulesetVersion": "kyc-eligibility-v1"
  },
  "credit": {
    "available": true,
    "tier": "provisional",
    "blockers": [],
    "advisories": ["agricultural_training_record"],
    "applicationSettled": false,
    "sanctionsClear": true
  },
  "consent": { "granted": true },
  "checkedAt": "2026-09-26T12:00:00.000Z"
}
```

`identity.verified` and `land.verified` are stamped by the platform's verifier
path; a farmer cannot self-attest them by submitting data. `credit.available`
is derived from the stored certification screen for the farmer's latest
application: it is `true` only when the application is still live, no blocking
gate failed, and the farmer carries no active sanctions. `credit.tier` mirrors
the certification tier (`full`, `provisional`, or `none`) so a reduced-confidence
cohort is visible instead of being flattened to a boolean.

### `POST /api/v2/farmers/verification`

Batch verification, for portfolios rather than one-off checks. Submit 1–100
unique Stellar public keys:

```bash
curl -X POST https://<host>/api/v2/farmers/verification \
  -H "x-api-key: fc_..." \
  -H "Content-Type: application/json" \
  -d '{"addresses": ["G...", "G..."]}'
```

```json
{
  "requested": 2,
  "count": 1,
  "verified": 1,
  "reports": [{ "farmerAddress": "G...", "verified": true }],
  "notFound": ["G..."],
  "consentDenied": []
}
```

`notFound` and `consentDenied` are separate so a caller can tell "not a
registered farmer" apart from "farmer opted out of disclosure". The whole
request is rejected (`400`, with per-entry `details`) when any address is
malformed or the batch exceeds 100 entries, so a partial tranche can never be
mistaken for a complete one.

All responses carry `X-API-Version: v2` and `X-API-Tier: <tier>`, and are
marked `Cache-Control: private, no-store` — verification data is per-farmer and
consent-bound, so it is never cached publicly.

## Notes

- Rate limits are enforced per API key on a rolling one-hour window.
- When a tier's hourly limit is reached, the API responds with HTTP
  `429 Too Many Requests` until the window resets.
- Invalid or revoked keys receive `401 Unauthorized`.
- Upgrading a key to a higher tier raises (or removes) the hourly allowance
  immediately.
- Endpoints that expose farmer data require the `x-api-key` header even when
  the shared per-IP limiter would otherwise allow the request.
