# Public REST API for Tree Sponsorship Data Integration

## Overview

The Tree Sponsorship Public API provides third-party applications, corporate sponsors, ESG auditing platforms, and environmental dashboards with authenticated, real-time access to tree sponsorship data, reforestation project metrics, species botanical catalogues, and certified CO2 sequestration totals.

---

## Authentication: OAuth 2.0 Client Credentials

Third-party integrators authenticate using the standard RFC 6749 OAuth 2.0 Client Credentials Grant.

### Obtaining a Bearer Token

```http
POST /api/v1/oauth/token HTTP/1.1
Host: api.farmcredit.org
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "your_client_id",
  "client_secret": "your_client_secret",
  "scope": "trees:read projects:read species:read co2:read"
}
```

Or with `application/x-www-form-urlencoded`:

```http
POST /api/v1/oauth/token HTTP/1.1
Host: api.farmcredit.org
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=your_client_id&client_secret=your_client_secret
```

### Response

```json
{
  "access_token": "fc_tok_a1b2c3d4e5",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "trees:read projects:read species:read co2:read"
}
```

Include the access token in subsequent requests:

```http
Authorization: Bearer fc_tok_a1b2c3d4e5
```

---

## Endpoints

### 1. Sponsored Trees

`GET /api/v1/trees`

Query Parameters:
- `species` (optional): Filter by tree species (e.g. `Teak`, `Mangrove`, `Moringa`).
- `sponsored` (optional): `true` to list only sponsored trees, `false` for unsponsored inventory.
- `project` (optional): Filter by reforestation project name substring.
- `page` (optional, default `1`): Page number.
- `per_page` (optional, default `20`, max `100`): Results per page.

Response contains tree records with on-chain NFT token IDs, sponsor display names, latitude/longitude, and annual carbon absorption rates.

---

### 2. Reforestation Projects

`GET /api/v1/projects`

Query Parameters:
- `country` (optional): Filter by project country (`Nigeria`, `Ghana`, `Tanzania`).
- `status` (optional): Filter by project status (`active`, `completed`, `expanding`).

Returns active reforestation zones, target vs sponsored tree counts, primary botanical species, and annual project carbon sequestration totals.

---

### 3. Tree Species Catalogue

`GET /api/v1/species`

Query Parameters:
- `min_co2` (optional): Filter species sequestering at least N kg CO2 per year.
- `growth_rate` (optional): Filter by growth speed (`fast`, `moderate`, `slow`).

Returns scientific nomenclature, maturity curves, supported climate zones, and ecological benefits (e.g. soil nitrogen fixation, coastal erosion protection).

---

### 4. CO2 Sequestration Statistics

`GET /api/v1/co2/stats`

Returns platform-wide aggregate carbon metrics:
- Total trees tracked & sponsored count
- Total annual CO2 sequestered (kg and metric tonnes)
- EPA-standard environmental equivalencies:
  - Typical passenger vehicles off the road per year
  - Transatlantic passenger flights offset
  - Households' annual electricity consumption offset
- Breakdown by species and project

---

## Interactive Sandbox & Developer Portal

Visit the interactive Developer Portal at `/developer` or `/api-docs/developer` to:
1. Generate temporary Sandbox OAuth 2.0 Bearer tokens with 1 click.
2. Interactively test endpoints with query parameters.
3. Inspect live HTTP response headers, latencies, and JSON payloads.
4. Export ready-to-run cURL, JavaScript (Fetch), and Python (requests) code snippets.
