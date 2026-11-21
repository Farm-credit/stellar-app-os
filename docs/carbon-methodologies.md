# Carbon Methodology Library (v1)

A reference catalogue of carbon calculation methodologies, stored in Postgres and
exposed read-only through the API. It answers *"which methodologies exist for this
project type, and how do they calculate?"*

## Scope

**In scope (v1)**

- `carbon_methodologies` table (migration `025`)
- 67 methodologies across five categories: `reforestation`, `soil_sequestration`,
  `renewable_energy`, `methane_reduction`, `energy_efficiency`
- Idempotent seed script and validated JSON source data
- Read-only API: list/filter/search and get-by-slug

**Out of scope (v1)**

- Executing calculations or computing credits from inputs
- Admin create/update/delete endpoints or UI
- Methodology version history
- Integration with credit issuance / Stellar minting

## Data model

| Column | Notes |
| --- | --- |
| `slug` (PK) | Stable kebab-case id, e.g. `vm0047`, `ams-iii-d` |
| `code`, `name` | Registry code and title as published |
| `category` | One of the five categories (DB `CHECK`) |
| `standard` | Issuing programme: `Verra VCS`, `CDM`, `Gold Standard`, `Climate Action Reserve`, `IPCC`, `Global Carbon Council`, `Platform` |
| `version` | Registry version the entry was checked against; `NULL` = not pinned |
| `description` | What the methodology covers |
| `formula` | Text summary of the core emission-reduction / removal equation |
| `parameters` | JSONB array of `{ symbol, name, unit, description }` |
| `applicability` | Conditions for use |
| `source_ref` | Where the summary came from |
| `metadata_verified` | `true` if code/title (and version when set) were confirmed against a registry page |

> **Important:** `formula` and `parameters` are *summaries for orientation*, not a
> substitute for the official methodology text. Anything used for real credit
> issuance must be checked against the current registry document.

## Data provenance

- 55 of 67 entries have `metadata_verified = true` (confirmed against Verra,
  UNFCCC CDM, Gold Standard or the repository itself).
- 12 entries are `false` — mainly IPCC guideline chapters, a few Verra/CAR/Gold
  Standard entries whose titles were not re-confirmed. Verify these before relying on them.
- Some CDM versions were taken from a BioCarbon Standard summary list (Feb 2024) and
  may have been superseded. Registries publish new versions regularly.
- AMS-III.AU (rice) is intentionally **not** listed: Verra inactivated it in 2023 and
  replaced it with VM0051, which is included.

## Running it

```bash
pnpm db:migrate                          # creates the table
pnpm seed:methodologies                  # validates JSON and upserts
pnpm seed:methodologies -- --dry-run     # validate only (no DB needed)
```

## API

`GET /api/carbon/methodologies?category=&standard=&q=&limit=&offset=`

`GET /api/carbon/methodologies/:slug`

Example: `/api/carbon/methodologies?category=methane_reduction&q=landfill`

## Adding or changing a methodology

1. Edit the matching file in `data/carbon-methodologies/` (one file per category).
2. Set `metadataVerified: true` only after confirming code/title/version on the registry page.
3. Run `pnpm seed:methodologies -- --dry-run`, then `pnpm test`.
4. Re-run `pnpm seed:methodologies` against the target database.

The schema in `lib/carbon/methodologies/types.ts` rejects duplicate slugs, unknown
categories and missing fields.
