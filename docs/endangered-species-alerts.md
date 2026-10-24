# Endangered Species Status Alerts — Quarterly IUCN Check

Closes #1657.

## What it does

Once a quarter, `.github/workflows/species-conservation-cron.yml` runs
`pnpm species:conservation-check` (`scripts/check-species-conservation.ts`,
which calls `lib/species/conservation-checker.ts`), which:

1. Picks every species in `species_catalogue` that has not been checked in the
   current calendar quarter (`species_iucn_status.last_check_quarter`).
2. Fetches their latest assessments from the **IUCN Red List API v4** in a
   single batched request.
3. Caches each assessment in `species_iucn_status` (migration `028`).
4. Detects a change worth telling a sponsor about:
   - **newly listed** — the species is now Vulnerable / Endangered /
     Critically Endangered and was not threatened before (or was never
     assessed by us), or
   - **upgraded** — the species was already threatened and moved to a more
     severe category (VU → EN, EN → CR).
5. For each change, finds every sponsor holding live trees of that species
   (`trees.sponsor_wallet`) and writes one `species_conservation_alerts` row
   per sponsor.
6. Emails each sponsor the conservation context and a link to the platform's
   educational page for the species.

## Deduplication and retries

The quarterly label (`2026-Q4`) is the idempotency key:

- A species already stamped with the current quarter is not re-fetched.
- Alert rows are `UNIQUE (species_slug, sponsor_wallet, new_status_code,
check_quarter)` with `ON CONFLICT DO NOTHING`, so a re-run of the same
  quarter creates no duplicates.
- Emails are sent once per alert row (`email_sent_at IS NULL` guard), so a
  retry after a partial failure only sends the ones that have not gone out.

If the IUCN request fails outright, **nothing is stamped as checked** — the
quarter is not burned and the alert is delayed by at most one retry, not one
full quarter.

If `IUCN_RED_LIST_API_TOKEN` is unset the run is skipped entirely. The
platform never invents a conservation category: no token means no alerts.

## Notifications

Each alert is delivered on two channels:

- **In-app** — `GET /api/species/conservation-alerts?wallet=…` is polled once
  per connected wallet by `SpeciesConservationNotifier` (mounted in
  `app/layout.tsx`), which raises a `species_conservation_alert` entry in the
  notification center. Entries carry the IUCN category, population trend,
  sponsor tree count and quarter, plus a "Learn more" action linking to the
  species page. Seen alerts are de-duplicated client-side via localStorage,
  mirroring the sponsor badge notifier.
- **Email** — `sendSpeciesConservationAlertEmail` (`lib/email/sendgrid.ts`)
  sends the same conservation context as HTML and text, with a CTA to the
  species page and a link to the full IUCN assessment. If no email address can
  be resolved for a wallet, the in-app alert is still marked delivered and the
  email leg is skipped.

## Educational content

Every alert links to `/species/[slug]`
(`app/species/[slug]/page.tsx`), which renders:

- the species overview, ecological role, conservation note and stewardship
  guidance from `lib/species/education.ts`,
- the live IUCN assessment cached by the quarterly check, with a link to the
  IUCN Red List record, and
- sponsor calls-to-action.

## Configuration

| Env var                            | Purpose                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`                     | Postgres connection                                       |
| `IUCN_RED_LIST_API_TOKEN`          | IUCN Red List API v4 bearer token                         |
| `SENDGRID_API_KEY`                 | Optional — without it alerts are recorded but not emailed |
| `SENDGRID_FROM_EMAIL`              | Optional — sender address                                 |
| `NEXT_PUBLIC_APP_URL`              | Base URL used for links inside alert emails               |
| `SPECIES_CONSERVATION_CRON_SECRET` | Only for `POST /api/species/conservation-check`           |

## Running manually

```bash
# CLI (same code path as the workflow)
pnpm species:conservation-check

# Or over HTTP, for platforms that prefer a cron hitting an endpoint
curl -X POST "$APP_URL/api/species/conservation-check" \
  -H "Authorization: Bearer $SPECIES_CONSERVATION_CRON_SECRET"
```
