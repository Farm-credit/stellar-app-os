# Farmer Verification API — Third-Party Integrations

## Overview

The v1 Farmer Verification API (issue #1341) provides third-party partner platforms, lenders, insurers, and financial institutions with a consent-bound view of the farmer's stored KYC verification state.

This integration answers three critical counterparty questions without exposing PII (Personally Identifiable Information) or unredacted identity documents:

1. **Identity**: Has a verified agent checked the farmer against a valid national document (NIN, voter card, passport, driver's licence)?
2. **Land Ownership**: Has a verifier confirmed the plot? Tenure is one of `title_deed`, `lease`, `customary`, `communal`, or `family_inheritance`. Consented reports include coordinates and plot area in hectares.
3. **Credit Availability**: Does the stored certification screening indicate eligibility, and on what tier (`full`, `provisional`, or `none`)? This is an eligibility assertion; it does not report a loan balance, lending limit, or commitment to fund.

Both lookups use the most recently submitted KYC application, with `updated_at` and application ID breaking ties. A newer rejection, expiration, sanction, or withheld consent takes precedence over an older approval. `verified` is true only for an approved application. `credit.available` requires an eligible screening, no active sanctions, and a status other than rejected or expired; a pending application can therefore be eligible while awaiting approval. A missing screening is ineligible.

---

## Authentication

All requests to `/api/v1/farmers/*` must be authenticated with an API key:

```http
GET /api/v1/farmers/GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF/verification HTTP/1.1
Host: api.farmcredit.org
X-API-Key: fc_live_your_partner_key
Accept: application/json
```

Or via the `Authorization` header:

```http
Authorization: ApiKey fc_live_your_partner_key
```

Both formats resolve against the same persisted, hashed API-key store and receive the same tiered limits. If both headers are supplied, `X-API-Key` takes precedence. OAuth bearer tokens are not accepted by these verification endpoints. Create a key through `POST /api/api-keys`; retain the raw key returned at creation, as it cannot be recovered later.

### Rate Limits & Quotas

Responses include headers reflecting your partner quota:

- `X-API-Tier`: `free` | `standard` | `premium`
- `X-API-Version`: `v1`
- `Cache-Control`: `private, no-store, max-age=0`

The existing proxy enforces rolling hourly budgets: free = 100 requests, standard = 1,000 requests, premium = unlimited. An exhausted budget returns `429` with `Retry-After`; retry after that delay. A batch consumes one request. Browser integrations must use an origin allowed by `ALLOWED_ORIGINS` or `VERIFIED_PARTNER_DOMAINS`.

---

## Endpoints

### 1. Single Farmer Verification

`GET /api/v1/farmers/{farmerAddress}/verification`

#### Request Parameters

- `farmerAddress` (path parameter): A 56-character Stellar public key starting with `G`, including a valid StrKey checksum. Surrounding whitespace is trimmed.

#### Response Example (`200 OK`)

```json
{
  "farmerAddress": "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  "apiVersion": "v1",
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
    "plotSizeHectares": 3.5,
    "region": "Kano",
    "gpsCoordinates": {
      "latitude": 11.98,
      "longitude": 8.55
    }
  },
  "certification": {
    "eligible": true,
    "tier": "full",
    "blockers": [],
    "advisories": [],
    "rulesetVersion": "kyc-eligibility-v1"
  },
  "credit": {
    "available": true,
    "tier": "full",
    "blockers": [],
    "advisories": [],
    "applicationSettled": false,
    "sanctionsClear": true
  },
  "consent": {
    "granted": true
  },
  "checkedAt": "2026-10-22T16:00:00.000Z"
}
```

#### Error Codes

- `400 Bad Request`: `invalid_address` — `farmerAddress` is not a valid 56-character Stellar public key.
- `401 Unauthorized`: Missing or invalid API key credentials.
- `403 Forbidden`: `consent_denied` — The farmer has not granted consent for third-party disclosure.
- `404 Not Found`: `not_found` — No verification application on record for this farmer address.
- `429 Too Many Requests`: The key's hourly quota is exhausted; respect `Retry-After`.
- `503 Service Unavailable`: Verification data source or authentication service is temporarily unavailable.

---

### 2. Batch Verification for Partner Portfolios

`POST /api/v1/farmers/verification`

Submit 1 to 100 Stellar public keys in a single round-trip. The limit applies before de-duplication; duplicates are collapsed after trimming, and `requested` counts unique addresses. Reports and each missing/consent bucket follow request order. Malformed JSON or any invalid address rejects the entire batch with `400 invalid_request` and `details`; no farmer data is queried.

#### Request Body

```json
{
  "addresses": [
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
  ]
}
```

#### Response (`200 OK`)

```json
{
  "requested": 1,
  "count": 1,
  "verified": 1,
  "reports": [
    {
      "farmerAddress": "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      "apiVersion": "v1",
      "verificationStatus": "verified",
      "verified": true,
      "identity": { "verified": true, "verifiedAt": "2026-07-01T10:00:00.000Z", "documentType": "nin" },
      "land": { "verified": true, "verifiedAt": "2026-07-02T10:00:00.000Z", "ownershipType": "customary", "plotSizeHectares": 3.5, "region": "Kano", "gpsCoordinates": { "latitude": 11.98, "longitude": 8.55 } },
      "certification": { "eligible": true, "tier": "full", "blockers": [], "advisories": [], "rulesetVersion": "kyc-eligibility-v1" },
      "credit": { "available": true, "tier": "full", "blockers": [], "advisories": [], "applicationSettled": false, "sanctionsClear": true },
      "consent": { "granted": true },
      "checkedAt": "2026-10-22T16:00:00.000Z"
    }
  ],
  "notFound": [],
  "consentDenied": []
}
```

---

## Privacy Architecture

The API selects a limited set of KYC columns and builds reports explicitly:

- Names, villages, evidence images, document numbers and their hashes, phone numbers, dates of birth, and reviewer notes are excluded. These reports describe the off-chain KYC record, rather than performing a fresh on-chain attestation.
- If consent is not explicitly confirmed by the farmer, the API returns `consent_denied` (`403 Forbidden`) or aggregates the address into `consentDenied` rather than leaking partial data.
- Farmer records and errors use private, no-store responses. Authentication and verification-store outages fail closed with `503`; internal error details are not included in the response.

## Deployment

Apply the existing database migrations (`npm run db:migrate`) with `DATABASE_URL` configured, including `017_create_api_keys.sql` and `019_create_farmer_kyc.sql`. Provision a partner API key and populate KYC records through the existing onboarding/review workflow. These endpoints require the database-backed key store; sandbox OAuth credentials do not grant access.

## Verification tests

Run route, authentication, validation, and privacy regressions with:

```sh
npm test -- app/api/v1/farmers lib/api/__tests__/farmer-verification.test.ts lib/__tests__/proxy-merge.test.ts
```

To also exercise application precedence against PostgreSQL, set `FARMER_VERIFICATION_TEST_DATABASE_URL` and run `npm test -- lib/api/__tests__/farmer-verification.postgres.test.ts`. This suite uses a connection-local temporary table and is skipped when the variable is absent.
